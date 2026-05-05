import { useState, useEffect } from 'react'
import './App.css'
import ChannelList from './components/ChannelList'
import ChannelView from './components/ChannelView'

const API_BASE = 'http://localhost:3000/api'

export interface Stats {
  totalProcessed: number
  successful: number
  failed: number
  successRate: string
  totalChunks: number
}

export interface Video {
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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/youtube/stats`)
      const statsData = await statsRes.json()
      
      setStats({
        totalProcessed: statsData.stats.totalProcessed,
        successful: statsData.stats.successful,
        failed: statsData.stats.failed,
        successRate: statsData.stats.successRate,
        totalChunks: statsData.totalChunks,
      })

      // Fetch all scraped videos
      const trackerRes = await fetch(`${API_BASE}/youtube/tracker`)
      const trackerData = await trackerRes.json()
      
      // Group videos by channel
      const channelMap = new Map<string, Channel>()
      
      if (trackerData.success && trackerData.videos) {
        trackerData.videos.forEach((video: Video) => {
          const channelName = video.channelTitle || 'Unknown Channel'
          
          if (!channelMap.has(channelName)) {
            channelMap.set(channelName, {
              name: channelName,
              url: `https://www.youtube.com/@${channelName.toLowerCase().replace(/\s+/g, '')}`,
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

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading channels...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          {selectedChannel ? (
            <div className="header-with-back">
              <button onClick={handleBack} className="back-btn">
                ← Back to Channels
              </button>
              <div>
                <h1>{selectedChannel.name}</h1>
                <p>{selectedChannel.videoCount} videos • {selectedChannel.totalChunks} chunks</p>
              </div>
            </div>
          ) : (
            <>
              <h1>🎬 YouTube Transcript Explorer</h1>
              <p>Search through {stats?.totalChunks || 0} transcript chunks from {stats?.totalProcessed || 0} videos</p>
            </>
          )}
        </div>
      </header>

      {!selectedChannel && stats && (
        <div className="stats-bar">
          <div className="container">
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Channels</span>
                <span className="stat-value">{channels.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Videos</span>
                <span className="stat-value">{stats.totalProcessed}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Chunks</span>
                <span className="stat-value">{stats.totalChunks}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Success Rate</span>
                <span className="stat-value">{stats.successRate}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="container">
        {selectedChannel ? (
          <ChannelView channel={selectedChannel} apiBase={API_BASE} />
        ) : (
          <ChannelList channels={channels} onChannelSelect={handleChannelSelect} />
        )}
      </main>
    </div>
  )
}

