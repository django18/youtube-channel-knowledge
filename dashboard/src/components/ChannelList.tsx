import type { Channel } from '../App'
import { Card, CardContent } from './ui/card'
import { Video, FileText } from 'lucide-react'

interface Props {
  channels: Channel[]
  onChannelSelect: (channel: Channel) => void
}

export default function ChannelList({ channels, onChannelSelect }: Props) {
  if (channels.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">No Channels Found</h2>
        <p className="text-muted-foreground">Scrape some YouTube channels to get started!</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Your Channels</h2>
        <p className="text-muted-foreground">Select a channel to explore and search its videos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map((channel, index) => (
          <Card
            key={index}
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-105 hover:border-primary"
            onClick={() => onChannelSelect(channel)}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white text-2xl font-bold">
                  {channel.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg mb-2 truncate">
                    {channel.name}
                  </h3>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      <span>{channel.videoCount} videos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>{channel.totalChunks} chunks</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
