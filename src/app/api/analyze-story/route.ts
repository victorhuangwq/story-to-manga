import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { storyAnalysisLogger, logApiRequest, logApiResponse, logError } from '@/lib/logger';
import { parseGeminiJSON } from '@/lib/json-parser';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const endpoint = '/api/analyze-story';
  
  logApiRequest(storyAnalysisLogger, endpoint);

  try {
    const { story, style } = await request.json();

    storyAnalysisLogger.debug({ 
      story_length: story?.length || 0, 
      style 
    }, 'Received story analysis request');

    if (!story || !style) {
      storyAnalysisLogger.warn({ story: !!story, style: !!style }, 'Missing required parameters');
      logApiResponse(storyAnalysisLogger, endpoint, false, Date.now() - startTime, { error: 'Missing parameters' });
      return NextResponse.json(
        { error: 'Story and style are required' },
        { status: 400 }
      );
    }

    // Validate story length (500 words max)
    const wordCount = story.trim().split(/\s+/).length;
    storyAnalysisLogger.debug({ wordCount }, 'Calculated word count');
    
    if (wordCount > 500) {
      storyAnalysisLogger.warn({ wordCount, limit: 500 }, 'Story exceeds word limit');
      logApiResponse(storyAnalysisLogger, endpoint, false, Date.now() - startTime, { error: 'Word limit exceeded' });
      return NextResponse.json(
        { error: `Story too long. Maximum 500 words, got ${wordCount} words.` },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
Analyze this story and extract the main characters with their detailed characteristics:

Story: "${story}"

Style: ${style}

Please provide:
1. A list of main characters (2-4 maximum) with:
   - Name
   - Physical description (age, build, hair, clothing, distinctive features)
   - Personality traits
   - Role in the story

2. Setting description (time period, location, mood)

Format your response as JSON:
{
  "characters": [
    {
      "name": "Character Name",
      "physicalDescription": "Detailed physical appearance",
      "personality": "Key personality traits",
      "role": "Role in story"
    }
  ],
  "setting": {
    "timePeriod": "When the story takes place",
    "location": "Where the story takes place", 
    "mood": "Overall tone/atmosphere"
  }
}
`;

    storyAnalysisLogger.info({ 
      model: 'gemini-2.5-flash',
      prompt_length: prompt.length 
    }, 'Calling Gemini API for story analysis');

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    storyAnalysisLogger.debug({ 
      response_length: text.length 
    }, 'Received response from Gemini API');

    // Parse JSON response
    let analysisData;
    try {
      analysisData = parseGeminiJSON(text);
      storyAnalysisLogger.info({ 
        characters_count: analysisData.characters?.length || 0,
        has_setting: !!analysisData.setting 
      }, 'Successfully parsed story analysis');
    } catch (parseError) {
      logError(storyAnalysisLogger, parseError, 'JSON parsing', { response_text: text.substring(0, 1000) });
      logApiResponse(storyAnalysisLogger, endpoint, false, Date.now() - startTime, { error: 'JSON parsing failed', response_preview: text.substring(0, 200) });
      return NextResponse.json(
        { error: 'Failed to parse story analysis' },
        { status: 500 }
      );
    }

    logApiResponse(storyAnalysisLogger, endpoint, true, Date.now() - startTime, { 
      characters_count: analysisData.characters?.length || 0,
      word_count: wordCount 
    });

    return NextResponse.json({
      success: true,
      analysis: analysisData,
      wordCount
    });

  } catch (error) {
    logError(storyAnalysisLogger, error, 'story analysis');
    logApiResponse(storyAnalysisLogger, endpoint, false, Date.now() - startTime, { error: 'Unexpected error' });
    return NextResponse.json(
      { error: 'Failed to analyze story' },
      { status: 500 }
    );
  }
}