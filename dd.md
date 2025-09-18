# Web Streams Implementation Design Document

## Overview
Migrate from Zustand store-orchestrated sequential API calls to a server-side streaming architecture using Web Streams API. This enables continuous manga generation even when users navigate away from the page.

## Problem Statement
Currently, manga generation stops when users navigate away because all API calls are triggered from the client-side through the Zustand store's `generateComic` function. When the page unmounts, pending fetch requests are cancelled, interrupting the generation process.

## Architecture

### Current State
```
Client (page.tsx) → useGenerationStore (Zustand)
  ├── fetch → /api/analyze-story
  ├── fetch → /api/generate-character-refs (single batch call)
  ├── fetch → /api/chunk-story
  └── fetch → /api/generate-panel (multiple sequential calls)
```

**Additional existing endpoints:**
- `/api/reddit` - Fetches Reddit post content
- `/api/report-issue` - Handles issue reporting

**Issues:**
- Generation stops if user navigates away
- Multiple round trips increase latency (especially for panels)
- Client (Zustand store) responsible for orchestration logic
- No way to resume interrupted generation
- Uses IndexedDB for image storage but still vulnerable to interruption

### Proposed State
```
Client (page.tsx) → useGenerationStore (Zustand)
  └── fetch (streaming) → /api/generate-manga-stream
                            ├── analyzeStory()
                            ├── generateCharacterRefs()
                            ├── chunkStory()
                            └── generatePanels()
```

**Benefits:**
- Server-side orchestration continues even if client disconnects
- Single connection reduces overhead
- Real-time progress updates via streaming
- Better error recovery options

## Implementation Plan

### 1. New Streaming Endpoint
**File:** `/src/app/api/generate-manga-stream/route.ts`

**Responsibilities:**
- Orchestrate entire generation pipeline
- Stream progress updates as NDJSON (newline-delimited JSON)
- Handle errors gracefully without breaking stream
- Support request cancellation

**Stream Message Types:**
```typescript
type StreamMessage = 
  | { type: 'status'; step: string; message: string }
  | { type: 'analysis'; data: StoryAnalysis }
  | { type: 'chunks'; data: StoryBreakdown }
  | { type: 'character'; data: CharacterReference }
  | { type: 'panel'; panelNumber: number; data: GeneratedPanel }
  | { type: 'error'; step: string; message: string; retrying?: boolean }
  | { type: 'complete'; totalPanels: number };
```

### 2. Client-Side Stream Consumer
**Updates to:** `/src/stores/useGenerationStore.ts`

**Key Changes:**
- Add new `generateComicStream()` method alongside existing `generateComic()`
- Parse streaming NDJSON responses
- Update Zustand store progressively as data arrives
- Leverage existing IndexedDB image storage
- Handle connection drops with auto-reconnect
- Maintain backward compatibility with existing persisted state structure

### 3. Stream Processing Flow

```typescript
// Server-side flow
1. Receive story + style + optional references
2. Start streaming response
3. Analyze story → stream { type: 'analysis' }
4. Chunk story → stream { type: 'chunks' }
5. For each character:
   - Generate reference → stream { type: 'character' }
6. For each panel:
   - Generate image → stream { type: 'panel' }
7. Stream { type: 'complete' }
```

### 4. Error Handling Strategy

**Errors that trigger retry:**
- Network timeouts
- Rate limiting (429)
- Temporary server errors (503)
- Gemini API transient errors

**Strategy:**
```typescript
// Simple single retry for each step
const retryOnce = async (fn, stepName) => {
  try {
    return await fn();
  } catch (error) {
    // Log first failure
    console.error(`First attempt failed for ${stepName}:`, error);
    
    // Stream retry status to client
    send({ type: 'status', step: 'retry', message: `Retrying ${stepName}...` });
    
    // Wait 1 second before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      return await fn();
    } catch (retryError) {
      // If retry also fails, log and throw
      console.error(`Retry failed for ${stepName}:`, retryError);
      throw retryError;
    }
  }
};
```

**Non-recoverable Errors:**
- Invalid input (400)
- Authentication failures (401)
- Critical errors

**Response:**
- Stream error message to client
- Continue with next item if possible
- Terminate stream for critical errors

### 5. Progressive Enhancement

**Phase 1: Basic Streaming** (MVP)
- Implement streaming endpoint
- Update client to consume stream
- Maintain current UI/UX
- Basic error handling

**Phase 2: Enhanced Features** (Future)
- Store partial results in localStorage
- Allow "continue from panel X" if interrupted
- Add progress persistence across sessions

## Technical Implementation

### Required Refactoring
Before implementing the streaming endpoint, the existing API logic needs to be extracted into reusable functions:

1. **Extract core logic from API routes:**
   - `/api/analyze-story/route.ts` → `analyzeStory()` function
   - `/api/chunk-story/route.ts` → `chunkStory()` function
   - `/api/generate-character-refs/route.ts` → `generateCharacterRef()` function
   - `/api/generate-panel/route.ts` → `generatePanel()` function

2. **Create shared utility modules:**
   - `/lib/generation/story-analyzer.ts`
   - `/lib/generation/story-chunker.ts`
   - `/lib/generation/character-generator.ts`
   - `/lib/generation/panel-generator.ts`

3. **Ensure consistency:**
   - All functions should use the existing `callGeminiWithRetry` helper
   - Maintain existing logging with module-specific loggers
   - Preserve existing error handling patterns

### Server Implementation
```typescript
// /api/generate-manga-stream/route.ts
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const { story, style, uploadedCharacterReferences, uploadedSettingReferences } = await request.json();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: StreamMessage) => {
        controller.enqueue(
          encoder.encode(JSON.stringify(data) + '\n')
        );
      };
      
      // Helper function for single retry
      const retryOnce = async (fn: () => Promise<any>, stepName: string) => {
        try {
          return await fn();
        } catch (error) {
          console.error(`First attempt failed for ${stepName}:`, error);
          send({ type: 'status', step: 'retry', message: `Retrying ${stepName}...` });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            return await fn();
          } catch (retryError) {
            console.error(`Retry failed for ${stepName}:`, retryError);
            throw retryError;
          }
        }
      };
      
      try {
        // Step 1: Analyze story (with single retry)
        send({ type: 'status', step: 'analysis', message: 'Analyzing story...' });
        const analysis = await retryOnce(
          async () => {
            // Call existing analyze-story logic
            // This would be extracted from the existing route handler
            return await analyzeStory(story, style);
          },
          'story analysis'
        );
        send({ type: 'analysis', data: analysis });
        
        // Step 2: Chunk story (with single retry)
        send({ type: 'status', step: 'chunks', message: 'Breaking down story...' });
        const chunks = await retryOnce(
          async () => {
            // Call existing chunk-story logic
            return await chunkStory(story, analysis.characters, analysis.setting, style);
          },
          'story chunking'
        );
        send({ type: 'chunks', data: chunks });
        
        // Step 3: Generate characters (each with single retry)
        const characterReferences = [];
        for (const character of analysis.characters) {
          send({ type: 'status', step: 'character', message: `Creating ${character.name}...` });
          try {
            const charRef = await retryOnce(
              async () => {
                // Call existing generate-character-refs logic
                return await generateCharacterRef(
                  character,
                  analysis.setting,
                  style,
                  uploadedCharacters
                );
              },
              `character generation for ${character.name}`
            );
            characterReferences.push(charRef);
            send({ type: 'character', data: charRef });
          } catch (error) {
            // Log error but continue with other characters
            console.error(`Failed to generate ${character.name} after retry:`, error);
            send({ type: 'error', step: 'character', message: `Failed to generate ${character.name}` });
          }
        }
        
        // Step 4: Generate panels (each with single retry)
        for (let i = 0; i < chunks.panels.length; i++) {
          send({ type: 'status', step: 'panel', message: `Generating panel ${i + 1}...` });
          try {
            const panel = await retryOnce(
              async () => {
                // Call existing generate-panel logic
                return await generatePanel(
                  chunks.panels[i],
                  characterReferences,
                  analysis.setting,
                  style,
                  uploadedSettings
                );
              },
              `panel ${i + 1}`
            );
            send({ type: 'panel', panelNumber: i, data: panel });
          } catch (error) {
            // Log error but continue with other panels
            console.error(`Failed to generate panel ${i + 1} after retry:`, error);
            send({ type: 'error', step: 'panel', message: `Failed to generate panel ${i + 1}` });
          }
        }
        
        send({ type: 'complete', totalPanels: chunks.panels.length });
      } catch (error) {
        send({ type: 'error', step: 'critical', message: error.message });
      } finally {
        controller.close();
      }
    },
    
    cancel() {
      // Cleanup on client disconnect
      console.log('Stream cancelled by client');
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'no-sniff',
    },
  });
}
```

### Client Implementation
```typescript
// useGenerationStore.ts updates
interface GenerationState {
  // ... existing state ...
  generateComicStream: (
    storyText: string,
    style: ComicStyle,
    uploadedCharacterReferences: UploadedCharacterReference[],
    uploadedSettingReferences: UploadedSettingReference[],
  ) => Promise<void>;
}

// Add to store actions
generateComicStream: async (
  storyText,
  style,
  uploadedCharacterReferences,
  uploadedSettingReferences,
) => {
  const state = _get();

  if (!storyText.trim()) {
    set({ error: "Please enter a story" });
    return;
  }

  const storyWordCount = storyText
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  if (storyWordCount > 500) {
    set({ error: "Story must be 500 words or less" });
    return;
  }

  // Clear previous results
  state.clearResults();

  // Track generation start
  const generationStartTime = Date.now();
  trackEvent({
    action: "start_generation_stream",
    category: "manga_generation",
    label: style,
    value: storyWordCount,
  });

  set({
    isGenerating: true,
    currentStepText: "Connecting to stream...",
    error: null,
    failedStep: null,
    failedPanel: null,
  });

  try {
    const response = await fetch('/api/generate-manga-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story: storyText,
        style,
        uploadedCharacterReferences,
        uploadedSettingReferences
      }),
    });

    if (!response.ok) throw new Error('Stream request failed');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line);
          await handleStreamMessage(message);
        } catch (e) {
          console.error('Failed to parse stream message:', line);
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    set({
      error: error instanceof Error ? error.message : 'Generation failed',
      isGenerating: false,
    });
  }
},

// Helper function in store
async function handleStreamMessage(message: StreamMessage) {
  switch (message.type) {
    case 'status':
      set({ currentStepText: message.message });
      break;

    case 'analysis':
      set({
        storyAnalysis: message.data,
        openAccordions: new Set(["analysis"])
      });
      break;

    case 'chunks':
      set({
        storyBreakdown: message.data,
        openAccordions: new Set(["layout"])
      });
      break;

    case 'character':
      const currentChars = _get().characterReferences;
      await _get().setCharacterReferences([...currentChars, message.data]);
      set({ openAccordions: new Set(["characters"]) });
      break;

    case 'panel':
      const currentPanels = _get().generatedPanels;
      const updated = [...currentPanels];
      updated[message.panelNumber] = message.data;
      await _get().setGeneratedPanels(updated);
      if (message.panelNumber === 0) {
        set({ openAccordions: new Set(["panels"]) });
        // Track time to first panel
        trackPerformance("time_to_first_panel", Date.now() - generationStartTime);
      }
      break;

    case 'error':
      console.error('Generation error:', message);
      if (!message.retrying) {
        set({
          error: `Error during ${message.step}: ${message.message}`,
          failedStep: message.step as FailedStep
        });
        trackError(`stream_${message.step}_failed`, message.message);
      }
      break;

    case 'complete':
      set({
        currentStepText: "Complete! 🎉",
        isGenerating: false
      });
      // Track successful generation
      trackMangaGeneration(storyWordCount, message.totalPanels);
      trackPerformance("total_generation_time", Date.now() - generationStartTime);
      break;
  }
}
```

## Benefits

1. **Uninterrupted Generation:** Server-side orchestration continues even if user navigates away
2. **Better UX:** Real-time progress updates without polling
3. **Improved Performance:** Single connection reduces overhead vs multiple API calls
4. **Error Resilience:** Can retry individual steps without restarting entire process
5. **Mobile Friendly:** No dependency on client staying active or Service Workers
6. **Simpler Client:** Orchestration logic moves to server

## Migration Path

1. **Implement alongside existing code** - Add new endpoint without removing old ones
2. **Feature flag in Zustand store** - Add toggle to switch between `generateComic()` and `generateComicStream()`
3. **Testing** - Test with various story lengths and network conditions
4. **Gradual rollout** - Start with small % of users
5. **Monitor** - Leverage existing analytics (trackEvent, trackError, trackPerformance)
6. **Deprecate old endpoints** - Once stable, remove old code

## Existing Architecture Notes

### Zustand Store Structure
The app uses multiple Zustand stores:
- **useGenerationStore**: Main generation logic, API calls, and state
- **useStoryStore**: Story text and style management
- **useUploadStore**: Uploaded character/setting references
- **useDownloadStore**: Download functionality
- **useUIStore**: UI state management

### Persistence & Storage
- **IndexedDB**: Used for storing generated images (via ImageStorage class)
- **localStorage**: Zustand persist middleware for state persistence
- **Auto-save**: Existing auto-save hook that could be leveraged

### Analytics & Monitoring
Already implemented tracking functions:
- `trackEvent()` - User interactions
- `trackError()` - Error tracking
- `trackPerformance()` - Performance metrics
- `trackMangaGeneration()` - Generation success metrics

## Considerations & Limitations

### Platform Limitations
- **Vercel Function Timeout:** 
  - Hobby: 10 seconds
  - Pro: 60 seconds  
  - Enterprise: 900 seconds
  - May need to handle very long stories differently

### Technical Considerations
- **Memory Usage:** Streaming reduces memory footprint vs building entire response
- **Connection Stability:** Mobile networks may drop connections frequently
- **Browser Limits:** Some browsers limit response streaming duration
- **Backward Compatibility:** Must handle saved states from old version

### Monitoring & Observability
```typescript
// Add metrics for:
- Stream duration
- Completion rate
- Error frequency by type
- Retry success rate
- Client disconnection points
```

## Success Metrics

- **Completion Rate:** >95% of started generations complete
- **Error Rate:** <2% critical errors
- **Performance:** No regression in time-to-first-panel
- **User Experience:** Reduced complaints about lost progress

## Security Considerations

- Validate all input on server side
- Rate limit streaming endpoints
- Add request size limits
- Sanitize error messages sent to client
- Consider adding authentication for future

## Future Enhancements

1. **WebSocket Upgrade:** For bidirectional communication
2. **Job Queue System:** For handling longer generations
3. **Partial Save/Resume:** Store progress in database
4. **Parallel Generation:** Generate multiple panels simultaneously
5. **Progress Persistence:** Resume from any device

## Conclusion

Web Streams API provides a modern, standard approach to streaming data from server to client. This implementation will solve the current issue of interrupted generation while improving overall user experience and system resilience.