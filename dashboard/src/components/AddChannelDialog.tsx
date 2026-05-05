import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Loader2, Plus, X, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  apiBase: string
  onChannelAdded: () => void
  onClose: () => void
}

interface ScrapingProgress {
  status: 'idle' | 'scraping' | 'success' | 'error'
  message: string
  videosProcessed?: number
  totalChunks?: number
}

export default function AddChannelDialog({ apiBase, onChannelAdded, onClose }: Props) {
  const [channelUrl, setChannelUrl] = useState('')
  const [maxVideos, setMaxVideos] = useState(50)
  const [concurrency, setConcurrency] = useState(3)
  const [progress, setProgress] = useState<ScrapingProgress>({
    status: 'idle',
    message: ''
  })

  const handleAddChannel = async () => {
    if (!channelUrl.trim()) return

    // Validate YouTube URL
    if (!channelUrl.includes('youtube.com')) {
      setProgress({
        status: 'error',
        message: 'Please enter a valid YouTube channel URL'
      })
      return
    }

    setProgress({
      status: 'scraping',
      message: 'Starting channel scrape...'
    })

    try {
      const res = await fetch(`${apiBase}/youtube/scrape-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: channelUrl.trim(),
          maxVideos,
          storeInDB: true,
          skipScraped: true,
          concurrency
        })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to scrape channel')
      }

      setProgress({
        status: 'success',
        message: `Successfully added channel!`,
        videosProcessed: data.videosProcessed,
        totalChunks: data.totalChunks
      })

      // Refresh the channel list after 2 seconds
      setTimeout(() => {
        onChannelAdded()
        onClose()
      }, 2000)

    } catch (error: any) {
      setProgress({
        status: 'error',
        message: error.message || 'Failed to add channel'
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Plus className="h-6 w-6" />
                Add New Channel
              </CardTitle>
              <CardDescription className="mt-2">
                Paste a YouTube channel URL to scrape and add to your collection
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={progress.status === 'scraping'}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                YouTube Channel URL
              </label>
              <Input
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                placeholder="https://www.youtube.com/@channelname or https://www.youtube.com/channel/UCxxxx"
                disabled={progress.status === 'scraping'}
                className="mb-2"
              />
              <p className="text-xs text-muted-foreground">
                Example: https://www.youtube.com/@starterstory
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Max Videos
                </label>
                <Input
                  type="number"
                  value={maxVideos}
                  onChange={(e) => setMaxVideos(Number(e.target.value))}
                  min={1}
                  max={500}
                  disabled={progress.status === 'scraping'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Limit how many videos to scrape
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Concurrency
                </label>
                <select
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  disabled={progress.status === 'scraping'}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value={1}>1 worker (slow)</option>
                  <option value={3}>3 workers (balanced)</option>
                  <option value={5}>5 workers (fast)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Parallel processing speed
                </p>
              </div>
            </div>

            {progress.status !== 'idle' && (
              <Card className={`
                ${progress.status === 'scraping' ? 'border-blue-500 bg-blue-50/10' : ''}
                ${progress.status === 'success' ? 'border-green-500 bg-green-50/10' : ''}
                ${progress.status === 'error' ? 'border-red-500 bg-red-50/10' : ''}
              `}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    {progress.status === 'scraping' && (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500 mt-0.5" />
                    )}
                    {progress.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                    )}
                    {progress.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium mb-1">{progress.message}</p>
                      {progress.videosProcessed !== undefined && (
                        <p className="text-sm text-muted-foreground">
                          {progress.videosProcessed} videos processed • {progress.totalChunks} chunks stored
                        </p>
                      )}
                      {progress.status === 'scraping' && (
                        <p className="text-sm text-muted-foreground mt-2">
                          This may take a few minutes depending on the channel size...
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={progress.status === 'scraping'}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddChannel}
                disabled={!channelUrl.trim() || progress.status === 'scraping'}
              >
                {progress.status === 'scraping' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Channel
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
