'use client';

import { useState } from 'react';
import type { 
  CharacterReference, 
  GeneratedComicPage as ComicPage, 
  StoryAnalysis,
  StoryBreakdown,
  ComicStyle
} from '@/types';

export default function Home() {
  // Main state
  const [story, setStory] = useState('');
  const [style, setStyle] = useState<ComicStyle>('manga');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStepText, setCurrentStepText] = useState('');

  // Generated content state
  const [storyAnalysis, setStoryAnalysis] = useState<StoryAnalysis | null>(null);
  const [characterReferences, setCharacterReferences] = useState<CharacterReference[]>([]);
  const [storyBreakdown, setStoryBreakdown] = useState<StoryBreakdown | null>(null);
  const [generatedPages, setGeneratedPages] = useState<ComicPage[]>([]);
  const [error, setError] = useState<string | null>(null);

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

    // Only reset error and set generating state - keep existing content visible
    setIsGenerating(true);
    setCurrentStepText('Analyzing your story...');
    setError(null);

    try {
      // Step 1: Analyze story
      const analysisResponse = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, style }),
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze story');
      }

      const { analysis } = await analysisResponse.json();
      setStoryAnalysis(analysis);

      // Step 2: Generate character references
      setCurrentStepText('Creating character designs...');
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
      setCharacterReferences(characterReferences);

      // Step 3: Break down story into panels
      setCurrentStepText('Planning comic layout...');
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

      const { storyBreakdown: breakdown } = await storyBreakdownResponse.json();
      setStoryBreakdown(breakdown);

      // Step 4: Generate comic pages
      const pages: ComicPage[] = [];
      
      for (let i = 0; i < breakdown.pages.length; i++) {
        const page = breakdown.pages[i];
        setCurrentStepText(`Generating comic page ${i + 1}/${breakdown.pages.length}...`);
        
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
        setGeneratedPages([...pages]);
      }

      setCurrentStepText('Complete! 🎉');
      setIsGenerating(false);
      
    } catch (error) {
      console.error('Generation error:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
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
    generatedPages.forEach((page) => {
      downloadImage(page.image, `comic-page-${page.pageNumber}.jpg`);
    });
  };

  const clearResults = () => {
    setStoryAnalysis(null);
    setCharacterReferences([]);
    setStoryBreakdown(null);
    setGeneratedPages([]);
    setError(null);
  };

  return (
    <div className={`container-fluid min-vh-100 py-4 style-${style}`}>
      <div className="row h-100">
        {/* Left Panel - Input */}
        <div className="col-md-4 mb-4">
          <div className="comic-panel h-100 p-4">
            <h1 className="h2 text-center mb-4">
              Story to {style === 'manga' ? 'Manga' : 'Comic'} Generator
            </h1>
            
            {/* Style Selection */}
            <div className="mb-3">
              <label className="form-label">Comic Style</label>
              <div className="btn-group w-100" role="group">
                <input 
                  type="radio" 
                  className="btn-check" 
                  name="style" 
                  id="manga" 
                  checked={style === 'manga'} 
                  onChange={() => setStyle('manga')}
                />
                <label className="btn btn-manga-outline" htmlFor="manga">
                  Japanese Manga
                </label>
                
                <input 
                  type="radio" 
                  className="btn-check" 
                  name="style" 
                  id="comic" 
                  checked={style === 'comic'} 
                  onChange={() => setStyle('comic')}
                />
                <label className="btn btn-manga-outline" htmlFor="comic">
                  American Comic
                </label>
              </div>
            </div>

            {/* Story Input */}
            <div className="mb-3">
              <label className="form-label">
                Your Story <span className="badge bg-secondary">{wordCount}/500 words</span>
              </label>
              <textarea
                className="form-control form-control-manga"
                rows={8}
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="Enter your story here... (max 500 words)"
                disabled={isGenerating}
              />
              {wordCount > 500 && (
                <div className="form-text text-danger">
                  Story is too long. Please reduce to 500 words or less.
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="alert alert-danger" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              className="btn btn-manga-primary w-100 mb-2"
              onClick={generateComic}
              disabled={isGenerating || !story.trim() || wordCount > 500}
            >
              {isGenerating ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  {currentStepText}
                </>
              ) : (
                'Generate Comic'
              )}
            </button>
            
            {/* Clear Results Button */}
            {(storyAnalysis || characterReferences.length > 0 || storyBreakdown || generatedPages.length > 0) && (
              <button
                className="btn btn-manga-outline w-100"
                onClick={clearResults}
                disabled={isGenerating}
              >
                Clear Previous Results
              </button>
            )}
          </div>
        </div>

        {/* Right Panel - Generation Results */}
        <div className="col-md-8">
          <div className="comic-panel h-100 p-4">
            <h2 className="h3 mb-4">Behind the Scenes</h2>
            
            <div className="accordion accordion-manga" id="generationAccordion">
              
              {/* Step 1: Story Analysis */}
              <div className="accordion-item">
                <h2 className="accordion-header" id="analysisHeading">
                  <button 
                    className="accordion-button" 
                    type="button" 
                    data-bs-toggle="collapse" 
                    data-bs-target="#analysisCollapse"
                  >
                    <span className="me-2">{storyAnalysis ? '✅' : '⏳'}</span>
                    Step 1: Story Analysis
                    <span className={`badge ${storyAnalysis ? 'badge-manga-success' : 'badge-manga-warning'} ms-auto me-3`}>
                      {storyAnalysis ? 'completed' : 'pending'}
                    </span>
                  </button>
                </h2>
                <div 
                  id="analysisCollapse" 
                  className="accordion-collapse collapse show" 
                  data-bs-parent="#generationAccordion"
                >
                  <div className="accordion-body">
                    {storyAnalysis ? (
                      <div>
                        <h5>Characters:</h5>
                        <div className="row">
                          {storyAnalysis.characters.map((char, index) => (
                            <div key={index} className="col-sm-6 mb-3">
                              <div className="card card-manga">
                                <div className="card-body">
                                  <h6 className="card-title">{char.name}</h6>
                                  <p className="card-text small">{char.physicalDescription}</p>
                                  <p className="card-text"><em>{char.role}</em></p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <h5 className="mt-3">Setting:</h5>
                        <p><strong>Location:</strong> {storyAnalysis.setting.location}</p>
                        <p><strong>Time Period:</strong> {storyAnalysis.setting.timePeriod}</p>
                        <p><strong>Mood:</strong> {storyAnalysis.setting.mood}</p>
                      </div>
                    ) : (
                      <p className="text-muted">
                        Story analysis will appear here once generation begins.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Character Designs */}
              <div className="accordion-item">
                <h2 className="accordion-header" id="charactersHeading">
                  <button 
                    className="accordion-button collapsed" 
                    type="button" 
                    data-bs-toggle="collapse" 
                    data-bs-target="#charactersCollapse"
                  >
                    <span className="me-2">{characterReferences.length > 0 ? '✅' : '⏳'}</span>
                    Step 2: Character Designs
                    <span className={`badge ${characterReferences.length > 0 ? 'badge-manga-success' : 'badge-manga-warning'} ms-auto me-3`}>
                      {characterReferences.length > 0 ? 'completed' : 'pending'}
                    </span>
                  </button>
                </h2>
                <div 
                  id="charactersCollapse" 
                  className="accordion-collapse collapse" 
                  data-bs-parent="#generationAccordion"
                >
                  <div className="accordion-body">
                    {characterReferences.length > 0 ? (
                      <div className="character-grid">
                        <div className="row">
                          {characterReferences.map((char, index) => (
                            <div key={index} className="col-sm-6 col-lg-4 mb-3">
                              <div className="text-center">
                                <img 
                                  src={char.image} 
                                  alt={char.name}
                                  className="img-fluid rounded mb-2"
                                  style={{ height: '200px', objectFit: 'cover' }}
                                />
                                <h6>{char.name}</h6>
                                <p className="small text-muted">{char.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted">
                        Character design images will appear here after story analysis.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 3: Comic Layout Plan */}
              <div className="accordion-item">
                <h2 className="accordion-header" id="layoutHeading">
                  <button 
                    className="accordion-button collapsed" 
                    type="button" 
                    data-bs-toggle="collapse" 
                    data-bs-target="#layoutCollapse"
                  >
                    <span className="me-2">{storyBreakdown ? '✅' : '⏳'}</span>
                    Step 3: Comic Layout Plan
                    <span className={`badge ${storyBreakdown ? 'badge-manga-success' : 'badge-manga-warning'} ms-auto me-3`}>
                      {storyBreakdown ? 'completed' : 'pending'}
                    </span>
                  </button>
                </h2>
                <div 
                  id="layoutCollapse" 
                  className="accordion-collapse collapse" 
                  data-bs-parent="#generationAccordion"
                >
                  <div className="accordion-body">
                    {storyBreakdown ? (
                      <div>
                        {storyBreakdown.pages.map((page, pageIndex) => (
                          <div key={pageIndex} className="mb-4">
                            <h5>Page {page.pageNumber}</h5>
                            <p><strong>Layout:</strong> {page.panelLayout}</p>
                            <div className="row">
                              {page.panels.map((panel, panelIndex) => (
                                <div key={panelIndex} className="col-sm-6 mb-3">
                                  <div className="card card-manga">
                                    <div className="card-body">
                                      <h6 className="card-title">Panel {panel.panelNumber}</h6>
                                      <p className="card-text small">{panel.sceneDescription}</p>
                                      {panel.dialogue && (
                                        <p className="card-text speech-bubble small">
                                          "{panel.dialogue}"
                                        </p>
                                      )}
                                      <div className="small text-muted">
                                        <div><strong>Characters:</strong> {panel.characters.join(', ')}</div>
                                        <div><strong>Camera:</strong> {panel.cameraAngle}</div>
                                        <div><strong>Mood:</strong> {panel.visualMood}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted">
                        Comic layout plan will appear here after character designs are complete.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 4: Generated Pages */}
              <div className="accordion-item">
                <h2 className="accordion-header" id="pagesHeading">
                  <button 
                    className="accordion-button collapsed" 
                    type="button" 
                    data-bs-toggle="collapse" 
                    data-bs-target="#pagesCollapse"
                  >
                    <span className="me-2">{generatedPages.length > 0 ? '✅' : '⏳'}</span>
                    Step 4: Generated Pages
                    <span className={`badge ${generatedPages.length > 0 ? 'badge-manga-success' : 'badge-manga-warning'} ms-auto me-3`}>
                      {generatedPages.length > 0 ? 'completed' : 'pending'}
                    </span>
                  </button>
                </h2>
                <div 
                  id="pagesCollapse" 
                  className="accordion-collapse collapse" 
                  data-bs-parent="#generationAccordion"
                >
                  <div className="accordion-body">
                    {generatedPages.length > 0 ? (
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5>Your Comic Pages</h5>
                          <button 
                            className="btn btn-manga-primary"
                            onClick={downloadAllPages}
                          >
                            Download All Pages
                          </button>
                        </div>
                        <div className="row">
                          {generatedPages.map((page) => (
                            <div key={page.pageNumber} className="col-lg-6 mb-4">
                              <div className="text-center">
                                <img 
                                  src={page.image} 
                                  alt={`Comic Page ${page.pageNumber}`}
                                  className="img-fluid rounded comic-panel mb-2"
                                />
                                <h6>Page {page.pageNumber}</h6>
                                <p className="small text-muted mb-2">{page.panelLayout}</p>
                                <button
                                  className="btn btn-manga-outline btn-sm"
                                  onClick={() => downloadImage(page.image, `comic-page-${page.pageNumber}.jpg`)}
                                >
                                  Download Page
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted">
                        Your finished comic pages will appear here!
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
