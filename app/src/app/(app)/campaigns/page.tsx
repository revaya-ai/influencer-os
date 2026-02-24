'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, Users, DollarSign, FileCheck, AlertTriangle, Clock } from 'lucide-react'
import Topbar from '@/components/topbar'
import PipelineBoard from '@/components/pipeline-board'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'
import type { InfluencerCardData } from '@/components/influencer-card'
import type { Tables } from '@/lib/types/database'

interface CampaignOption {
  id: string
  name: string
  quarter: string | null
  budget: number | null
  posting_deadline: string | null
}

interface CampaignStats {
  influencerCount: number
  budget: number
  contentReceived: number
  paidOut: number
  overdue: number
}

export default function CampaignBoardPage() {
  const { selectedBrand } = useBrand()
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [items, setItems] = useState<InfluencerCardData[]>([])
  const [stats, setStats] = useState<CampaignStats>({
    influencerCount: 0,
    budget: 0,
    contentReceived: 0,
    paidOut: 0,
    overdue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  // Fetch campaigns for brand
  useEffect(() => {
    async function fetchCampaigns() {
      const supabase = createClient()
      let query = supabase
        .from('campaigns')
        .select('id, name, quarter, budget, posting_deadline')
        .order('created_at', { ascending: false })

      if (selectedBrand?.id) {
        query = query.eq('brand_id', selectedBrand.id)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch campaigns:', error.message)
        return
      }

      const campaignList = (data ?? []) as CampaignOption[]
      setCampaigns(campaignList)

      if (campaignList.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campaignList[0].id)
      } else if (campaignList.length === 0) {
        setSelectedCampaignId(null)
      }
    }

    fetchCampaigns()
  }, [selectedBrand])

  // Fetch pipeline data for selected campaign
  useEffect(() => {
    if (!selectedCampaignId) {
      setItems([])
      setStats({
        influencerCount: 0,
        budget: 0,
        contentReceived: 0,
        paidOut: 0,
        overdue: 0,
      })
      setLoading(false)
      return
    }

    async function fetchPipeline() {
      setLoading(true)
      const supabase = createClient()

      // Fetch campaign_influencers with influencer data
      const { data: ciData, error: ciErr } = await supabase
        .from('campaign_influencers')
        .select('id, influencer_id, pipeline_stage, deliverable')
        .eq('campaign_id', selectedCampaignId!)

      if (ciErr) {
        console.error('Failed to fetch pipeline:', ciErr.message)
        setLoading(false)
        return
      }

      const influencerIds = [...new Set((ciData ?? []).map((ci) => ci.influencer_id))]

      let influencerMap: Record<string, Tables<'influencers'>> = {}
      if (influencerIds.length > 0) {
        const { data: influencers } = await supabase
          .from('influencers')
          .select('*')
          .in('id', influencerIds)

        if (influencers) {
          influencerMap = Object.fromEntries(influencers.map((i) => [i.id, i]))
        }
      }

      const cardItems: InfluencerCardData[] = (ciData ?? []).map((ci) => {
        const inf = influencerMap[ci.influencer_id]
        return {
          id: ci.influencer_id,
          campaign_influencer_id: ci.id,
          name: inf?.name ?? 'Unknown',
          handle: inf?.handle ?? null,
          follower_count: inf?.follower_count ?? null,
          rate: inf?.rate ?? null,
          deliverable: ci.deliverable,
          pipeline_stage: ci.pipeline_stage,
        }
      })

      setItems(cardItems)

      // Campaign stats
      const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId)
      const today = new Date().toISOString().split('T')[0]

      const contentReceivedCount = cardItems.filter(
        (i) =>
          i.pipeline_stage === 'content_received' ||
          i.pipeline_stage === 'w9_done' ||
          i.pipeline_stage === 'invoice_received' ||
          i.pipeline_stage === 'paid' ||
          i.pipeline_stage === 'posted'
      ).length

      const overdueCount =
        selectedCampaign?.posting_deadline && selectedCampaign.posting_deadline < today
          ? cardItems.filter(
              (i) =>
                i.pipeline_stage === 'contacted' ||
                i.pipeline_stage === 'brief_sent'
            ).length
          : 0

      // Paid out
      let paidOut = 0
      const ciIds = (ciData ?? []).map((ci) => ci.id)
      if (ciIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .in('campaign_influencer_id', ciIds)

        paidOut = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
      }

      setStats({
        influencerCount: cardItems.length,
        budget: selectedCampaign?.budget ?? 0,
        contentReceived: contentReceivedCount,
        paidOut,
        overdue: overdueCount,
      })

      setLoading(false)
    }

    fetchPipeline()
  }, [selectedCampaignId, campaigns])

  const handleStageChange = useCallback(
    (campaignInfluencerId: string, newStage: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.campaign_influencer_id === campaignInfluencerId
            ? { ...item, pipeline_stage: newStage }
            : item
        )
      )
    },
    []
  )

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId)

  const statCards = [
    {
      label: 'Influencers',
      value: stats.influencerCount.toString(),
      icon: Users,
      color: '#1A6BFF',
      filterKey: 'all',
    },
    {
      label: 'Budget',
      value: `$${stats.budget.toLocaleString()}`,
      icon: DollarSign,
      color: '#059669',
      filterKey: null as string | null, // Budget is not filterable
    },
    {
      label: 'Content Received',
      value: stats.contentReceived.toString(),
      icon: FileCheck,
      color: '#fbbf24',
      filterKey: 'content_received',
    },
    {
      label: 'Paid Out',
      value: `$${stats.paidOut.toLocaleString()}`,
      icon: DollarSign,
      color: '#f59e0b',
      filterKey: 'paid',
    },
    {
      label: 'Overdue',
      value: stats.overdue.toString(),
      icon: AlertTriangle,
      color: '#dc2626',
      filterKey: 'overdue',
    },
  ]

  // Filter stages for each filter key
  const contentReceivedStages = ['content_received', 'w9_done', 'invoice_received', 'paid', 'posted']
  const paidStages = ['paid']
  const overdueStages = ['contacted', 'brief_sent']

  const selectedCampaignForFilter = campaigns.find((c) => c.id === selectedCampaignId)
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = selectedCampaignForFilter?.posting_deadline && selectedCampaignForFilter.posting_deadline < today

  const filteredItems = activeFilter
    ? items.filter((item) => {
        if (activeFilter === 'all') return true
        if (activeFilter === 'content_received') return contentReceivedStages.includes(item.pipeline_stage)
        if (activeFilter === 'paid') return paidStages.includes(item.pipeline_stage)
        if (activeFilter === 'overdue') return isOverdue && overdueStages.includes(item.pipeline_stage)
        return true
      })
    : items

  return (
    <>
      <Topbar title="Campaign Board">
        {/* Campaign Selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors min-w-[200px]"
          >
            <span className="truncate">
              {selectedCampaign?.name ?? 'Select campaign'}
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
              {campaigns.length === 0 ? (
                <div className="px-3 py-4 text-xs text-gray-400 text-center">
                  No campaigns found
                </div>
              ) : (
                campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => {
                      setSelectedCampaignId(campaign.id)
                      setDropdownOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between ${
                      campaign.id === selectedCampaignId
                        ? 'bg-[#eff6ff] text-[#1A6BFF]'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{campaign.name}</span>
                    {campaign.quarter && (
                      <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                        {campaign.quarter}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Topbar>

      <div className="flex-1 overflow-hidden bg-[#fafaf9] flex flex-col">
        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-4 px-6 py-4 shrink-0">
          {statCards.map((card) => {
            const Icon = card.icon
            const isClickable = card.filterKey !== null
            const isActive = activeFilter === card.filterKey
            return (
              <button
                key={card.label}
                onClick={() => {
                  if (!isClickable) return
                  setActiveFilter(isActive ? null : card.filterKey)
                }}
                className={`text-left bg-white rounded-xl p-4 border shadow-sm transition-all ${
                  isActive
                    ? 'ring-2 ring-offset-1 border-transparent'
                    : 'border-gray-200'
                } ${isClickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
                style={{
                  borderLeft: `4px solid ${card.color}`,
                  ...(isActive ? { ringColor: card.color, boxShadow: `0 0 0 2px ${card.color}33, 0 1px 3px rgba(0,0,0,0.1)` } : {}),
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: card.color }}><Icon size={14} /></span>
                  <span className="text-[10px] text-gray-500">{card.label}</span>
                </div>
                {loading ? (
                  <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-xl font-bold text-gray-900">{card.value}</p>
                )}
              </button>
            )
          })}
        </div>

        {/* Pipeline Board */}
        <div className="flex-1 px-6 pb-4 overflow-hidden flex flex-col">
          {activeFilter && (
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <span className="text-xs text-gray-500">
                Filtering: <span className="font-medium text-gray-700">{statCards.find(c => c.filterKey === activeFilter)?.label}</span>
                {' '}({filteredItems.length} of {items.length})
              </span>
              <button
                onClick={() => setActiveFilter(null)}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Clear filter
              </button>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
          {!selectedCampaignId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Clock size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">
                  Select a campaign to view the pipeline
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Loading pipeline...</p>
            </div>
          ) : (
            <PipelineBoard
              items={filteredItems}
              onStageChange={handleStageChange}
              onCardClick={(influencerId) => setSelectedInfluencerId(influencerId)}
            />
          )}
          </div>
        </div>
      </div>

      <ProfilePanel
        influencerId={selectedInfluencerId}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </>
  )
}
