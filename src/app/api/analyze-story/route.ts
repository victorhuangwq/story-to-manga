import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { story, style } = await request.json();

    if (!story || !style) {
      return NextResponse.json(
        { error: 'Story and style are required' },
        { status: 400 }
      );
    }

    // Validate story length (500 words max)
    const wordCount = story.trim().split(/\s+/).length;
    if (wordCount > 500) {
      return NextResponse.json(
        { error: `Story too long. Maximum 500 words, got ${wordCount} words.` },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON response
    let analysisData;
    try {
      analysisData = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse story analysis' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis: analysisData,
      wordCount
    });

  } catch (error) {
    console.error('Story analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze story' },
      { status: 500 }
    );
  }
}