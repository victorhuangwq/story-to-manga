import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// Helper function to convert base64 to format expected by Gemini
function prepareImageForGemini(base64Image: string) {
  // Remove data:image/xxx;base64, prefix if present
  const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
  return {
    inlineData: {
      data: base64Data,
      mimeType: 'image/jpeg'
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const { page, characterReferences, setting, style } = await request.json();

    if (!page || !characterReferences || !setting || !style) {
      return NextResponse.json(
        { error: 'Page, character references, setting, and style are required' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash-image-preview' 
    });

    const stylePrefix = style === 'manga' 
      ? 'Japanese manga style, black and white with screentones, dynamic panel layouts, right-to-left reading flow'
      : 'American comic book style, full color, clean line art, left-to-right reading flow';

    // Create detailed panel descriptions
    const panelDescriptions = page.panels.map((panel: any, index: number) => {
      const charactersInPanel = panel.characters.map((charName: string) => {
        const charRef = characterReferences.find((ref: any) => ref.name === charName);
        return charRef ? `${charName} (matching the character design shown in reference image)` : charName;
      }).join(' and ');

      return `Panel ${index + 1}: ${panel.cameraAngle} shot of ${charactersInPanel}. Scene: ${panel.sceneDescription}. ${panel.dialogue ? `Dialogue: "${panel.dialogue}"` : 'No dialogue.'}. Mood: ${panel.visualMood}.`;
    }).join(' ');

    const prompt = `
Create a complete comic book page in ${stylePrefix}.

Page Layout: ${page.panelLayout}
Setting: ${setting.location}, ${setting.timePeriod}, mood: ${setting.mood}

Panel Details:
${panelDescriptions}

IMPORTANT: Use the character reference images provided to maintain visual consistency. Each character should match their appearance from the reference images exactly.

The page should include:
- Panel borders clearly defining each section
- Speech bubbles with the dialogue text
- Thought bubbles if needed
- Sound effects where appropriate
- Consistent character designs matching the references
- Proper ${style === 'manga' ? 'right-to-left' : 'left-to-right'} reading flow

Generate a single complete comic page image.
`;

    // Prepare character reference images for input
    const inputParts = [prompt];
    
    // Add character reference images
    characterReferences.forEach((charRef: any) => {
      if (charRef.image) {
        inputParts.push(prepareImageForGemini(charRef.image));
      }
    });

    try {
      const result = await model.generateContent(inputParts);
      const response = result.response;
      
      // Get the image data
      const imageData = response.candidates?.[0]?.content?.parts?.[0];
      
      if (imageData && 'inlineData' in imageData) {
        const base64Image = imageData.inlineData?.data;
        const mimeType = imageData.inlineData?.mimeType || 'image/jpeg';
        
        return NextResponse.json({
          success: true,
          comicPage: {
            pageNumber: page.pageNumber,
            image: `data:${mimeType};base64,${base64Image}`,
            panelLayout: page.panelLayout
          }
        });
      } else {
        throw new Error('No image data received');
      }
    } catch (error) {
      console.error('Failed to generate comic page:', error);
      return NextResponse.json(
        { error: `Failed to generate comic page ${page.pageNumber}` },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Comic page generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate comic page' },
      { status: 500 }
    );
  }
}