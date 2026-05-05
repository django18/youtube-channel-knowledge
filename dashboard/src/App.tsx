import { useState, useEffect } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from './components/ui/button'
import ChannelList from './components/ChannelList'
import ChannelView from './components/ChannelView'
import AddChannelDialog from './components/AddChannelDialog'

const API_BASE = 'http://localhost:3000/api'

interface Stats {
  totalProcessed: number
  successful: number
  failed: number
  successRate: string
  totalChunks: number
}

interface Video {
  videoId: string
  videoTitle: string
  scrapedAt: string
  chunksCount: number
  channelTitle?: string
}

export interface Channel {
  name: string
  url: string
  videoCount: number
  totalChunks: number
  videos: Video[]
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const statsRes = await fetch(`${API_BASE}/youtube/stats`)
      const statsData = await statsRes.json()
      
      setStats({
        totalProcessed: statsData.stats.totalProcessed,
        successful: statsData.stats.successful,
        failed: statsData.stats.failed,
        successRate: statsData.stats.successRate,
        totalChunks: statsData.totalChunks,
      })

      const trackerRes = await fetch(`${API_BASE}/youtube/tracker`)
      const trackerData = await trackerRes.json()
      
      const channelMap = new Map<string, Channel>()
      
      if (trackerData.success && trackerData.videos) {
        trackerData.videos.forEach((video: Video) => {
          const channelName = video.channelTitle || 'Starter Story'
          
          if (!channelMap.has(channelName)) {
            channelMap.set(channelName, {
              name: channelName,
              url: `https://www.youtube.com/@starterstory`,
              videoCount: 0,
              totalChunks: 0,
              videos: [],
            })
          }
          
          const channel = channelMap.get(channelName)!
          channel.videos.push(video)
          channel.videoCount++
          channel.totalChunks += video.chunksCount
        })
      }

      setChannels(Array.from(channelMap.values()))
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(channel)
  }

  const handleBack = () => {
    setSelectedChannel(null)
  }

  const handleAddChannel = () => {
    setShowAddDialog(true)
  }

  const handleChannelAdded = () => {
    loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading channels...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-gradient-to-r from-purple-600 to-violet-600">
        <div className="container mx-auto px-4 py-6">
          {selectedChannel ? (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="text-white">
                <h1 className="text-3xl font-bold">{selectedChannel.name}</h1>
                <p className="text-purple-100">
                  {selectedChannel.videoCount} videos • {selectedChannel.totalChunks} chunks
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-white">
                <h1 className="text-4xl font-bold mb-2">🎬 YouTube Transcript Explorer</h1>
                <p className="text-purple-100">
                  Search through {stats?.totalChunks || 0} transcript chunks from {stats?.totalProcessed || 0} videos
                </p>
              </div>
              <Button
                onClick={handleAddChannel}
                className="bg-white text-purple-600 hover:bg-purple-50"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Channel
              </Button>
            </div>
          )}
        </div>
      </header>

      {!selectedChannel && stats && (
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">CHANNELS</div>
                <div className="text-3xl font-bold text-primary">{channels.length}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">VIDEOS</div>
                <div className="text-3xl font-bold text-primary">{stats.totalProcessed}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">CHUNKS</div>
                <div className="text-3xl font-bold text-primary">{stats.totalChunks}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">SUCCESS RATE</div>
                <div className="text-3xl font-bold text-primary">{stats.successRate}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        {selectedChannel ? (
          <ChannelView channel={selectedChannel} apiBase={API_BASE} />
        ) : (
          <ChannelList channels={channels} onChannelSelect={handleChannelSelect} />
        )}
      </main>

      {showAddDialog && (
        <AddChannelDialog
          apiBase={API_BASE}
          onChannelAdded={handleChannelAdded}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  )
}
