import { useState } from 'react'
import type { Channel } from '../App'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Search, Video, Calendar, ExternalLink, Loader2 } from 'lucide-react'

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
        body: JSON.stringify({ query: q, limit: limit * 2 }),
      })
      const data = await res.json()
      
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
    <div>
      <div className="flex gap-2 mb-6 border-b">
        <Button
          variant={activeTab === 'search' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('search')}
          className="rounded-b-none"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
        <Button
          variant={activeTab === 'videos' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('videos')}
          className="rounded-b-none"
        >
          <Video className="mr-2 h-4 w-4" />
          Videos ({channel.videoCount})
        </Button>
      </div>

      {activeTab === 'search' && (
        <div>
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-4">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={`Search within ${channel.name}...`}
                  className="flex-1"
                />
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value={5}>5 results</option>
                  <option value={10}>10 results</option>
                  <option value={20}>20 results</option>
                </select>
                <Button onClick={() => handleSearch()} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Try:</span>
                {EXAMPLE_QUERIES.map((eq, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => handleExampleQuery(eq)}
                  >
                    {eq}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Searching {channel.name}...</p>
            </div>
          )}

          {!loading && results.length === 0 && query && (
            <div className="text-center py-12">
              <p className="text-lg font-semibold mb-2">No results found in {channel.name}</p>
              <p className="text-muted-foreground">Try a different query or check out the examples above.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">
                {results.length} Results in {channel.name}
              </h2>
              <div className="space-y-4">
                {results.map((result, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <CardTitle className="text-lg">{result.videoTitle}</CardTitle>
                        <Badge className="shrink-0">
                          {(result.similarity * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">{result.text}</p>
                      <div className="flex items-center justify-between">
                        <a
                          href={result.timestampUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Watch at {result.timestamp}
                        </a>
                        <span className="text-xs text-muted-foreground font-mono">
                          {result.videoId}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {!loading && !query && (
            <div className="text-center py-12">
              <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-xl font-semibold mb-2">Search {channel.name}</h3>
              <p className="text-muted-foreground">
                Use the search box above to find specific insights from this channel's videos.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="space-y-4">
          {channel.videos.map((video, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="md:flex">
                <div className="md:w-64 flex-shrink-0">
                  <img
                    src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt={video.videoTitle}
                    className="w-full h-48 md:h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-6 flex-1">
                  <h3 className="font-semibold text-lg mb-2">{video.videoTitle}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      <span>{video.chunksCount} chunks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(video.scrapedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Watch on YouTube
                    </Button>
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
