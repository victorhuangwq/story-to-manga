# Story to Comic Generator

Transform your written stories into visual manga or comic book pages using Google Gemini 2.5 AI.

## Features

- **Multi-Style Generation**: Choose between Japanese manga or American comic book styles
- **Character Consistency**: AI generates character reference sheets and maintains visual consistency across panels
- **Progressive Display**: See character designs first, then comic pages as they're generated
- **Download Support**: Download individual pages or all pages at once
- **Smart Story Processing**: Automatically analyzes stories, identifies characters, and creates optimal panel layouts

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **AI Model**: Google Gemini 2.5 Flash Image (Preview)
- **Deployment**: AWS Amplify Gen 2

## Setup Instructions

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Get Google AI API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your API key:

```
GOOGLE_AI_API_KEY=your_actual_api_key_here
```

### 4. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## How It Works

1. **Story Analysis**: AI analyzes your story to identify main characters and setting
2. **Character Design**: Generates detailed character reference images for consistency
3. **Story Breakdown**: Intelligently chunks your story into comic panels with optimal layouts
4. **Page Generation**: Creates complete comic pages using character references for visual consistency

## Usage

1. Choose your preferred style (Manga or Comic)
2. Paste your story (max 500 words)
3. Click "Generate Comic"
4. Watch as character designs appear first, then comic pages
5. Download individual pages or all pages at once

## Deployment to AWS Amplify

1. Push your code to GitHub
2. Connect your GitHub repo to AWS Amplify
3. Add environment variable `GOOGLE_AI_API_KEY` in Amplify console
4. Deploy automatically on push

## Story Guidelines

**Best Results:**
- 200-500 words
- Clear character descriptions
- Simple, focused plots
- Dialogue-heavy scenes work well

**Avoid:**
- Very complex plots with many characters
- Stories requiring specific visual references
- Adult or inappropriate content

## Troubleshooting

**"Failed to generate character references"**
- Check API key is correct
- Ensure you haven't exceeded rate limits
- Try again in a few minutes

**"Story too long"**
- Reduce story to 500 words or less
- Focus on key scenes and dialogue

**Images not displaying**
- Check browser console for errors
- Ensure stable internet connection
- Try refreshing the page

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this for your own projects.
# story-to-manga
