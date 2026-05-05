import { useState, useEffect } from 'react'
import { Channel } from '../App'

interface Props {
  channel: Channel
  apiBase: string
}

interface SearchResult {
  videoId: string
  videoTitle: string
  videoUrl: string
  text: string
  timestamp: string
  timestampUrl: string
  similarity: number
}

const EXAMPLE_QUERIES = [
  'How did they get their first customers?',
  'What marketing channels worked best?',
  'How much revenue are they making?',
  'What mistakes did they make?',
  'How long did it take to build?',
  'What pricing strategy did they use?',
]

export default function ChannelView({ channel, apiBase }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(10)
  const [activeTab, setActiveTab] = useState<'search' | 'videos'>('search')

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query
    if (!q.trim()) return

    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/youtube/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: q, 
          limit: limit * 2, // Get more results to filter
        }),
      })
      const data = await res.json()
      
      // Filter results to only include videos from this channel
      const channelVideoIds = new Set(channel.videos.map(v => v.videoId))
      const filteredResults = (data.results || []).filter(
        (r: SearchResult) => channelVideoIds.has(r.videoId)
      ).slice(0, limit)
      
      setResults(filteredResults)
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleExampleQuery = (exampleQuery: string) => {
    setQuery(exampleQuery)
    handleSearch(exampleQuery)
  }

  return (
    <div className="channel-view">
      <div className="channel-tabs">
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Search
        </button>
        <button
          className={`tab ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          📹 Videos ({channel.videoCount})
        </button>
      </div>

      {activeTab === 'search' && (
        <div className="search-tab">
          <div className="search-section">
            <div className="search-box">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={`Search within ${channel.name}...`}
                className="search-input"
              />
              <div className="search-controls">
                <select 
                  value={limit} 
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="limit-select"
                >
                  <option value={5}>5 results</option>
                  <option value={10}>10 results</option>
                  <option value={20}>20 results</option>
                </select>
                <button onClick={() => handleSearch()} className="search-btn" disabled={loading}>
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>

            <div className="example-queries">
              <span className="example-label">Try:</span>
              {EXAMPLE_QUERIES.map((eq, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleQuery(eq)}
                  className="example-btn"
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>

          <div className="results-section">
            {loading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Searching {channel.name}...</p>
              </div>
            )}

            {!loading && results.length === 0 && query && (
              <div className="no-results">
                <p>No results found in {channel.name} for "{query}"</p>
                <p>Try a different query or check out the examples above.</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="results">
                <h2>{results.length} Results in {channel.name}</h2>
                {results.map((result, i) => (
                  <div key={i} className="result-card">
                    <div className="result-header">
                      <h3>{result.videoTitle}</h3>
                      <span className="similarity">
                        {(result.similarity * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <p className="result-text">{result.text}</p>
                    <div className="result-footer">
                      <a
                        href={result.timestampUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="watch-link"
                      >
                        ▶ Watch at {result.timestamp}
                      </a>
                      <span className="video-id">{result.videoId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && !query && (
              <div className="search-prompt">
                <div className="search-prompt-icon">🔍</div>
                <h3>Search {channel.name}</h3>
                <p>Use the search box above to find specific insights from this channel's videos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="videos-tab">
          <div className="video-list">
            {channel.videos.map((video, i) => (
              <div key={i} className="video-card">
                <div className="video-thumbnail">
                  <img 
                    src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt={video.videoTitle}
                    loading="lazy"
                  />
                </div>
                <div className="video-details">
                  <h3>{video.videoTitle}</h3>
                  <div className="video-meta">
                    <span>📝 {video.chunksCount} chunks</span>
                    <span>📅 {new Date(video.scrapedAt).toLocaleDateString()}</span>
                  </div>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="watch-link"
                  >
                    Watch on YouTube →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
