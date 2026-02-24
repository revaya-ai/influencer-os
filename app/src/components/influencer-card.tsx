'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

export interface InfluencerCardData {
  id: string
  campaign_influencer_id: string
  name: string
  handle: string | null
  follower_count: number | null
  rate: number | null
  deliverable: string | null
  pipeline_stage: string
}

interface InfluencerCardProps {
  data: InfluencerCardData
  onClick?: (id: string) => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatFollowers(count: number | null): string {
  if (!count) return '-'
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

export default function InfluencerCard({ data, onClick }: InfluencerCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: data.campaign_influencer_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isDragging ? 'shadow-lg z-50' : ''
      }`}
      onClick={() => onClick?.(data.id)}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {getInitials(data.name)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {data.name}
              </p>
              {data.handle && (
                <p className="text-xs text-gray-400 font-mono truncate">
                  @{data.handle}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">
                {formatFollowers(data.follower_count)} followers
              </span>
              {data.rate != null && (
                <span className="px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#059669] font-medium text-xs">
                  ${data.rate.toLocaleString()}
                </span>
              )}
            </div>
            {data.deliverable && (
              <p className="mt-1 text-xs text-gray-500 truncate">
                {data.deliverable}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
