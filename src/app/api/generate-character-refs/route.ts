import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { characters, setting, style } = await request.json();

    if (!characters || !setting || !style) {
      return NextResponse.json(
        { error: 'Characters, setting, and style are required' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash-image-preview' 
    });

    const characterReferences = [];

    for (const character of characters) {
      const stylePrefix = style === 'manga' 
        ? 'Japanese manga style, black and white, detailed character design with clean line art and screentones'
        : 'American comic book style, colorful superhero art with bold colors and clean line art';

      const prompt = `
Character reference sheet in ${stylePrefix}. 

Full body character design showing front view of ${character.name}:
- Physical appearance: ${character.physicalDescription}
- Personality: ${character.personality}
- Role: ${character.role}
- Setting context: ${setting.timePeriod}, ${setting.location}

The character should be drawn in a neutral pose against a plain background, showing their full design clearly for reference purposes. This is a character reference sheet that will be used to maintain consistency across multiple comic panels.
`;

      try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        
        // Get the image data
        const imageData = response.candidates?.[0]?.content?.parts?.[0];
        
        if (imageData && 'inlineData' in imageData) {
          const base64Image = imageData.inlineData?.data;
          const mimeType = imageData.inlineData?.mimeType || 'image/jpeg';
          
          characterReferences.push({
            name: character.name,
            image: `data:${mimeType};base64,${base64Image}`,
            description: character.physicalDescription
          });
        } else {
          throw new Error('No image data received');
        }
      } catch (error) {
        console.error(`Failed to generate reference for ${character.name}:`, error);
        return NextResponse.json(
          { error: `Failed to generate reference for ${character.name}` },
          { status: 500 }
        );
      }

      // Add delay to respect rate limits (free tier: 10 RPM)
      if (characters.indexOf(character) < characters.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 6500)); // 6.5 second delay
      }
    }

    return NextResponse.json({
      success: true,
      characterReferences
    });

  } catch (error) {
    console.error('Character reference generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate character references' },
      { status: 500 }
    );
  }
}