'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Zap, DollarSign, AlertTriangle, TrendingUp, Plus, ArrowRight, UserPlus } from 'lucide-react'
import Topbar from '@/components/topbar'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

interface StatCard {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color: string
  href: string
}

interface NeedsAttentionItem {
  id: string
  influencer_id: string
  name: string
  handle: string | null
  pipeline_stage: string
  campaign_name: string
}

interface ActiveCampaign {
  id: string
  name: string
  quarter: string | null
  influencer_count: number
}

const STAGE_LABELS: Record<string, string> = {
  contacted: 'Contacted',
  brief_sent: 'Brief Sent',
  content_received: 'Content Received',
  w9_done: 'W9 Done',
  invoice_received: 'Invoice Received',
  paid: 'Paid',
  posted: 'Posted',
}

function getStagePillStyle(stage: string): { bg: string; text: string } {
  switch (stage) {
    case 'contacted':
      return { bg: '#fef2f2', text: '#dc2626' }
    case 'brief_sent':
      return { bg: '#fefce8', text: '#a16207' }
    case 'content_received':
      return { bg: '#ecfdf5', text: '#059669' }
    default:
      return { bg: '#eff6ff', text: '#2563eb' }
  }
}

export default function DashboardPage() {
  const { selectedBrand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalInfluencers: 0,
    activeInCampaign: 0,
    budgetAllocated: 0,
    paidOut: 0,
    overdue: 0,
  })
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionItem[]>([])
  const [activeCampaigns, setActiveCampaigns] = useState<ActiveCampaign[]>([])
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true)
      const supabase = createClient()
      const brandId = selectedBrand?.id

      // Total influencers
      const { count: totalInfluencers } = await supabase
        .from('influencers')
        .select('*', { count: 'exact', head: true })

      // Active campaigns for selected brand
      let activeCampaignQuery = supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'active')

      if (brandId) {
        activeCampaignQuery = activeCampaignQuery.eq('brand_id', brandId)
      }

      const { data: activeCampaignsData } = await activeCampaignQuery

      const activeCampaignIds = (activeCampaignsData ?? []).map((c) => c.id)

      // Active in campaign count
      let activeInCampaign = 0
      if (activeCampaignIds.length > 0) {
        const { count } = await supabase
          .from('campaign_influencers')
          .select('*', { count: 'exact', head: true })
          .in('campaign_id', activeCampaignIds)

        activeInCampaign = count ?? 0
      }

      // Budget allocated
      const budgetAllocated = (activeCampaignsData ?? []).reduce(
        (sum, c) => sum + (c.budget ?? 0),
        0
      )

      // Paid out
      let paidOut = 0
      if (activeCampaignIds.length > 0) {
        const { data: ciForPayments } = await supabase
          .from('campaign_influencers')
          .select('id')
          .in('campaign_id', activeCampaignIds)

        const ciIds = (ciForPayments ?? []).map((ci) => ci.id)

        if (ciIds.length > 0) {
          const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .in('campaign_influencer_id', ciIds)

          paidOut = (payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
        }
      }

      // Overdue: campaign_influencers where stage < content_received AND campaign posting_deadline < today
      const today = new Date().toISOString().split('T')[0]
      let overdue = 0

      if (activeCampaignIds.length > 0) {
        const overdueCampaigns = (activeCampaignsData ?? []).filter(
          (c) => c.posting_deadline && c.posting_deadline < today
        )
        const overdueCampaignIds = overdueCampaigns.map((c) => c.id)

        if (overdueCampaignIds.length > 0) {
          const { count: overdueCount } = await supabase
            .from('campaign_influencers')
            .select('*', { count: 'exact', head: true })
            .in('campaign_id', overdueCampaignIds)
            .in('pipeline_stage', ['contacted', 'brief_sent'])

          overdue = overdueCount ?? 0
        }
      }

      setStats({
        totalInfluencers: totalInfluencers ?? 0,
        activeInCampaign,
        budgetAllocated,
        paidOut,
        overdue,
      })

      // Needs Attention items
      if (activeCampaignIds.length > 0) {
        const overdueCampaigns = (activeCampaignsData ?? []).filter(
          (c) => c.posting_deadline && c.posting_deadline < today
        )
        const overdueCampaignIds = overdueCampaigns.map((c) => c.id)

        if (overdueCampaignIds.length > 0) {
          const { data: attentionData } = await supabase
            .from('campaign_influencers')
            .select('id, influencer_id, pipeline_stage, campaign_id')
            .in('campaign_id', overdueCampaignIds)
            .in('pipeline_stage', ['contacted', 'brief_sent'])
            .limit(10)

          if (attentionData && attentionData.length > 0) {
            const influencerIds = [...new Set(attentionData.map((a) => a.influencer_id))]
            const { data: influencers } = await supabase
              .from('influencers')
              .select('id, name, handle')
              .in('id', influencerIds)

            const influencerMap = Object.fromEntries(
              (influencers ?? []).map((i) => [i.id, i])
            )
            const campaignMap = Object.fromEntries(
              (activeCampaignsData ?? []).map((c) => [c.id, c.name])
            )

            setNeedsAttention(
              attentionData.map((a) => ({
                id: a.id,
                influencer_id: a.influencer_id,
                name: influencerMap[a.influencer_id]?.name ?? 'Unknown',
                handle: influencerMap[a.influencer_id]?.handle ?? null,
                pipeline_stage: a.pipeline_stage,
                campaign_name: campaignMap[a.campaign_id] ?? 'Unknown',
              }))
            )
          }
        }
      }

      // Active campaigns with influencer counts
      const campaignsWithCounts: ActiveCampaign[] = []
      for (const campaign of activeCampaignsData ?? []) {
        const { count: ciCount } = await supabase
          .from('campaign_influencers')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)

        campaignsWithCounts.push({
          id: campaign.id,
          name: campaign.name,
          quarter: campaign.quarter,
          influencer_count: ciCount ?? 0,
        })
      }
      setActiveCampaigns(campaignsWithCounts)

      setLoading(false)
    }

    fetchDashboard()
  }, [selectedBrand])

  const statCards: StatCard[] = [
    {
      label: 'Total Influencers',
      value: stats.totalInfluencers.toString(),
      icon: Users,
      color: '#1A6BFF',
      href: '/rolodex',
    },
    {
      label: 'Active This Campaign',
      value: stats.activeInCampaign.toString(),
      icon: Zap,
      color: '#FF0080',
      href: '/campaigns',
    },
    {
      label: 'Budget Allocated',
      value: `$${stats.budgetAllocated.toLocaleString()}`,
      icon: TrendingUp,
      color: '#059669',
      href: '/payments',
    },
    {
      label: 'Paid Out',
      value: `$${stats.paidOut.toLocaleString()}`,
      icon: DollarSign,
      color: '#f59e0b',
      href: '/payments',
    },
    {
      label: 'Overdue',
      value: stats.overdue.toString(),
      icon: AlertTriangle,
      color: '#dc2626',
      href: '/chase',
    },
  ]

  return (
    <>
      <Topbar title="Dashboard">
        <Link
          href="/rolodex?add=true"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A6BFF] text-white text-xs font-semibold rounded-lg hover:bg-[#1558e0] transition-colors"
        >
          <UserPlus size={14} />
          Add Influencer
        </Link>
      </Topbar>

      <div className="flex-1 overflow-y-auto bg-[#fafaf9]">
        {/* Welcome Bar */}
        <div
          className="mx-6 mt-6 rounded-xl p-6 flex items-center justify-between"
          style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #3a1a2e 100%)',
          }}
        >
          <div>
            <h2 className="text-xl font-bold text-white">
              Good morning, Angela
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {activeCampaigns.length > 0
                ? `You have ${activeCampaigns.length} active campaign${activeCampaigns.length !== 1 ? 's' : ''} running`
                : 'No active campaigns yet. Create one to get started.'}
            </p>
          </div>
          <Link
            href="/campaigns/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF0080] text-white text-sm font-medium rounded-lg hover:bg-[#e60073] transition-colors shrink-0"
          >
            <Plus size={16} />
            New Campaign
          </Link>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-5 gap-4 px-6 mt-6">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <Link
                key={card.label}
                href={card.href}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow group"
                style={{ borderLeft: `4px solid ${card.color}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: card.color }} className="opacity-70">
                    <Icon size={18} />
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-gray-300 group-hover:text-gray-500 transition-colors"
                  />
                </div>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              </Link>
            )
          })}
        </div>

        {/* Two Tables */}
        <div className="grid grid-cols-2 gap-6 px-6 mt-6 pb-6">
          {/* Needs Attention */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Needs Attention
              </h3>
              <Link
                href="/chase"
                className="text-xs text-[#1A6BFF] hover:underline"
              >
                View all
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
                ))}
              </div>
            ) : needsAttention.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400">No overdue items</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {needsAttention.map((item) => {
                  const pillStyle = getStagePillStyle(item.pipeline_stage)
                  return (
                    <div
                      key={item.id}
                      className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-bold">
                            {item.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {item.name}
                          </p>
                          {item.handle && (
                            <p className="text-[10px] text-gray-400 font-mono truncate">
                              @{item.handle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{
                            backgroundColor: pillStyle.bg,
                            color: pillStyle.text,
                          }}
                        >
                          {STAGE_LABELS[item.pipeline_stage] ?? item.pipeline_stage}
                        </span>
                        <button
                          onClick={() => setSelectedInfluencerId(item.influencer_id)}
                          className="px-2.5 py-1 text-[10px] font-medium text-[#1A6BFF] bg-[#eff6ff] rounded hover:bg-[#dbeafe] transition-colors"
                        >
                          Chase
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Active Campaigns */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Active Campaigns
              </h3>
              <Link
                href="/campaigns"
                className="text-xs text-[#1A6BFF] hover:underline"
              >
                View all
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
                ))}
              </div>
            ) : activeCampaigns.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-400">No active campaigns</p>
                <Link
                  href="/campaigns/new"
                  className="inline-flex items-center gap-1 text-xs text-[#1A6BFF] hover:underline mt-2"
                >
                  <Plus size={12} />
                  Create one
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {activeCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href="/campaigns"
                    className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 block"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {campaign.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {campaign.quarter && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#eff6ff] text-[#2563eb]">
                          {campaign.quarter}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {campaign.influencer_count} influencer
                        {campaign.influencer_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
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
