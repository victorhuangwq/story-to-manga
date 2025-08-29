'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Character {
  name: string;
  physicalDescription: string;
  personality: string;
  role: string;
}

interface CharacterReference {
  name: string;
  image: string;
  description: string;
}

interface ComicPage {
  pageNumber: number;
  image: string;
  panelLayout: string;
}

export default function Home() {
  const [story, setStory] = useState('');
  const [style, setStyle] = useState<'manga' | 'comic'>('manga');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [characterRefs, setCharacterRefs] = useState<CharacterReference[]>([]);
  const [comicPages, setComicPages] = useState<ComicPage[]>([]);
  const [error, setError] = useState('');

  const wordCount = story.trim().split(/\s+/).filter(word => word.length > 0).length;

  const generateComic = async () => {
    if (!story.trim()) {
      setError('Please enter a story');
      return;
    }

    if (wordCount > 500) {
      setError('Story must be 500 words or less');
      return;
    }

    setIsGenerating(true);
    setError('');
    setCharacterRefs([]);
    setComicPages([]);

    try {
      // Step 1: Analyze story
      setCurrentStep('Analyzing your story...');
      const analysisResponse = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, style }),
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze story');
      }

      const { analysis } = await analysisResponse.json();

      // Step 2: Generate character references
      setCurrentStep('Creating character designs...');
      const charRefResponse = await fetch('/api/generate-character-refs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          characters: analysis.characters, 
          setting: analysis.setting, 
          style 
        }),
      });

      if (!charRefResponse.ok) {
        throw new Error('Failed to generate character references');
      }

      const { characterReferences } = await charRefResponse.json();
      setCharacterRefs(characterReferences);

      // Step 3: Break down story into panels
      setCurrentStep('Planning comic layout...');
      const storyBreakdownResponse = await fetch('/api/chunk-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          story, 
          characters: analysis.characters, 
          setting: analysis.setting, 
          style 
        }),
      });

      if (!storyBreakdownResponse.ok) {
        throw new Error('Failed to break down story');
      }

      const { storyBreakdown } = await storyBreakdownResponse.json();

      // Step 4: Generate comic pages
      const pages: ComicPage[] = [];
      for (let i = 0; i < storyBreakdown.pages.length; i++) {
        const page = storyBreakdown.pages[i];
        setCurrentStep(`Generating comic page ${i + 1}/${storyBreakdown.pages.length}...`);
        
        const pageResponse = await fetch('/api/generate-comic-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            page, 
            characterReferences, 
            setting: analysis.setting, 
            style 
          }),
        });

        if (!pageResponse.ok) {
          throw new Error(`Failed to generate page ${i + 1}`);
        }

        const { comicPage } = await pageResponse.json();
        pages.push(comicPage);
        setComicPages([...pages]);
      }

      setCurrentStep('Complete! 🎉');
      
    } catch (error) {
      console.error('Generation error:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (imageUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.click();
  };

  const downloadAllPages = () => {
    comicPages.forEach((page, index) => {
      downloadImage(page.image, `comic-page-${page.pageNumber}.jpg`);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
            Story to {style === 'manga' ? 'Manga' : 'Comic'} Generator
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Transform your stories into visual masterpieces
          </p>
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Story Style
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setStyle('manga')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  style === 'manga' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Japanese Manga
              </button>
              <button
                onClick={() => setStyle('comic')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  style === 'comic' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                American Comic
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Story ({wordCount}/500 words)
            </label>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Paste your story here... (max 500 words)"
              className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={isGenerating}
            />
            {wordCount > 500 && (
              <p className="text-red-500 text-sm mt-1">
                Story is too long. Please reduce to 500 words or less.
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={generateComic}
            disabled={isGenerating || !story.trim() || wordCount > 500}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium py-3 px-6 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? currentStep : 'Generate Comic'}
          </button>
        </div>

        {/* Character References Display */}
        {characterRefs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              Character Designs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {characterRefs.map((char, index) => (
                <div key={index} className="text-center">
                  <img
                    src={char.image}
                    alt={char.name}
                    className="w-full h-48 object-cover rounded-lg mb-2"
                  />
                  <h4 className="font-medium text-gray-800 dark:text-white">{char.name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{char.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comic Pages Display */}
        {comicPages.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
                Generated Comic Pages
              </h3>
              <button
                onClick={downloadAllPages}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Download All Pages
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {comicPages.map((page) => (
                <div key={page.pageNumber} className="text-center">
                  <img
                    src={page.image}
                    alt={`Comic Page ${page.pageNumber}`}
                    className="w-full rounded-lg shadow-md mb-2"
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Page {page.pageNumber}: {page.panelLayout}
                  </p>
                  <button
                    onClick={() => downloadImage(page.image, `comic-page-${page.pageNumber}.jpg`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
