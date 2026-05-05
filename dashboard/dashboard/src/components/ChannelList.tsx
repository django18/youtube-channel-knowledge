import { Channel } from '../App'

interface Props {
  channels: Channel[]
  onChannelSelect: (channel: Channel) => void
}

export default function ChannelList({ channels, onChannelSelect }: Props) {
  if (channels.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Channels Found</h2>
        <p>Scrape some YouTube channels to get started!</p>
      </div>
    )
  }

  return (
    <div className="channel-list-section">
      <div className="section-header">
        <h2>Your Channels</h2>
        <p>Select a channel to explore and search its videos</p>
      </div>

      <div className="channel-grid">
        {channels.map((channel, index) => (
          <div
            key={index}
            className="channel-card"
            onClick={() => onChannelSelect(channel)}
          >
            <div className="channel-icon">
              {channel.name.charAt(0)}
            </div>
            <div className="channel-info">
              <h3>{channel.name}</h3>
              <div className="channel-stats">
                <span className="channel-stat">
                  📹 {channel.videoCount} videos
                </span>
                <span className="channel-stat">
                  📝 {channel.totalChunks} chunks
                </span>
              </div>
            </div>
            <div className="channel-arrow">→</div>
          </div>
        ))}
      </div>
    </div>
  )
}
