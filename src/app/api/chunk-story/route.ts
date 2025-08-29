import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { story, characters, setting, style } = await request.json();

    if (!story || !characters || !setting || !style) {
      return NextResponse.json(
        { error: 'Story, characters, setting, and style are required' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const characterNames = characters.map((c: any) => c.name).join(', ');
    
    const layoutGuidance = style === 'manga' 
      ? `
Manga layout guidelines:
- Right-to-left reading flow
- Dynamic panel shapes and sizes
- 4-6 panels per page maximum
- Vertical emphasis for dramatic moments
- Action lines and motion blur for movement
- Close-ups for emotional beats
- Wide shots for establishing scenes
`
      : `
American comic layout guidelines:
- Left-to-right reading flow
- Rectangular panels in grid format
- 4-6 panels per page maximum
- Consistent panel borders
- Wide establishing shots
- Medium shots for dialogue
- Close-ups for dramatic moments
`;

    const prompt = `
Break down this story into comic book pages with detailed panel descriptions.

Story: "${story}"
Characters: ${characterNames}
Setting: ${setting.location}, ${setting.timePeriod}, ${setting.mood}
Style: ${style}

${layoutGuidance}

Create 2-4 pages maximum. For each page, describe:
1. Panel layout (how many panels, arrangement)
2. Each panel with:
   - Characters present
   - Action/scene description
   - Dialogue (if any)
   - Camera angle (close-up, medium shot, wide shot, etc.)
   - Visual mood/atmosphere

Format as JSON:
{
  "pages": [
    {
      "pageNumber": 1,
      "panelLayout": "Description of panel arrangement (e.g., '3 panels - large top panel, two smaller bottom panels')",
      "panels": [
        {
          "panelNumber": 1,
          "characters": ["Character names present"],
          "sceneDescription": "Detailed description of what's happening",
          "dialogue": "Any spoken text or thought bubbles",
          "cameraAngle": "Shot type and perspective",
          "visualMood": "Atmosphere and visual style notes"
        }
      ]
    }
  ]
}
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON response
    let storyBreakdown;
    try {
      storyBreakdown = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse story breakdown' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      storyBreakdown
    });

  } catch (error) {
    console.error('Story chunking error:', error);
    return NextResponse.json(
      { error: 'Failed to chunk story' },
      { status: 500 }
    );
  }
}