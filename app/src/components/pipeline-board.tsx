'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import InfluencerCard, { type InfluencerCardData } from './influencer-card'
import { createClient } from '@/lib/supabase/client'

const PIPELINE_STAGES = [
  { key: 'contacted', label: 'Contacted', color: '#94a3b8' },
  { key: 'brief_sent', label: 'Brief Sent', color: '#60a5fa' },
  { key: 'content_received', label: 'Content Received', color: '#fbbf24' },
  { key: 'w9_done', label: 'W9 Done', color: '#a78bfa' },
  { key: 'invoice_received', label: 'Invoice Received', color: '#fb923c' },
  { key: 'paid', label: 'Paid', color: '#34d399' },
  { key: 'posted', label: 'Posted', color: '#FF0080' },
] as const

interface PipelineBoardProps {
  items: InfluencerCardData[]
  onStageChange: (campaignInfluencerId: string, newStage: string) => void
  onCardClick?: (influencerId: string) => void
}

function DroppableColumn({
  stageKey,
  stageLabel,
  stageColor,
  items,
  onCardClick,
}: {
  stageKey: string
  stageLabel: string
  stageColor: string
  items: InfluencerCardData[]
  onCardClick?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey })

  return (
    <div
      className="flex flex-col min-w-[220px] w-[220px] shrink-0"
      style={{ maxHeight: '100%' }}
    >
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: stageColor }}
        />
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider truncate">
          {stageLabel}
        </span>
        <span className="ml-auto text-[11px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
          {items.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto rounded-lg p-1.5 space-y-2 transition-colors ${
          isOver ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-gray-50/50'
        }`}
      >
        <SortableContext
          items={items.map((i) => i.campaign_influencer_id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <InfluencerCard
              key={item.campaign_influencer_id}
              data={item}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-300">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

export default function PipelineBoard({
  items,
  onStageChange,
  onCardClick,
}: PipelineBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localItems, setLocalItems] = useState<InfluencerCardData[]>(items)

  // Sync when parent items change
  if (items !== localItems && JSON.stringify(items) !== JSON.stringify(localItems)) {
    setLocalItems(items)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const activeItem = localItems.find(
    (i) => i.campaign_influencer_id === activeId
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeItemId = active.id as string
    const overId = over.id as string

    // Check if dropping over a column
    const isOverColumn = PIPELINE_STAGES.some((s) => s.key === overId)

    if (isOverColumn) {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.campaign_influencer_id === activeItemId
            ? { ...item, pipeline_stage: overId }
            : item
        )
      )
    } else {
      // Dropping over another card - find that card's stage
      const overItem = localItems.find(
        (i) => i.campaign_influencer_id === overId
      )
      if (overItem) {
        setLocalItems((prev) =>
          prev.map((item) =>
            item.campaign_influencer_id === activeItemId
              ? { ...item, pipeline_stage: overItem.pipeline_stage }
              : item
          )
        )
      }
    }
  }, [localItems])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (!over) return

      const activeItemId = active.id as string
      const currentItem = localItems.find(
        (i) => i.campaign_influencer_id === activeItemId
      )

      if (currentItem) {
        // Persist to Supabase
        const supabase = createClient()
        const { error } = await supabase
          .from('campaign_influencers')
          .update({ pipeline_stage: currentItem.pipeline_stage })
          .eq('id', activeItemId)

        if (error) {
          console.error('Failed to update pipeline stage:', error.message)
          // Revert on error
          setLocalItems(items)
          return
        }

        onStageChange(activeItemId, currentItem.pipeline_stage)
      }
    },
    [localItems, items, onStageChange]
  )

  const groupedByStage = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    items: localItems.filter((i) => i.pipeline_stage === stage.key),
  }))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {groupedByStage.map((stage) => (
          <DroppableColumn
            key={stage.key}
            stageKey={stage.key}
            stageLabel={stage.label}
            stageColor={stage.color}
            items={stage.items}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="rotate-2 scale-105">
            <InfluencerCard data={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
