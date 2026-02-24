'use client'

import { useEffect, useState } from 'react'
import {
  BarChart3,
  DollarSign,
  Megaphone,
  Users,
  TrendingUp,
  Crown,
} from 'lucide-react'
import Topbar from '@/components/topbar'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

// --- Types ---

interface SummaryStats {
  totalCampaigns: number
  totalInfluencers: number
  totalBudget: number
  totalPaid: number
}

interface CampaignRow {
  id: string
  name: string
  retailer: string | null
  quarter: string | null
  influencerCount: number
  budget: number
  paidOut: number
  completionRate: number
}

interface PipelineCount {
  stage: string
  count: number
}

interface TopInfluencer {
  id: string
  name: string
  handle: string | null
  campaignCount: number
  totalEarned: number
  avgStageIndex: number
}

// --- Constants ---

const PIPELINE_STAGES = [
  'contacted',
  'brief_sent',
  'content_received',
  'w9_done',
  'invoice_received',
  'paid',
  'posted',
] as const

const STAGE_LABELS: Record<string, string> = {
  contacted: 'Contacted',
  brief_sent: 'Brief Sent',
  content_received: 'Content Received',
  w9_done: 'W9 Done',
  invoice_received: 'Invoice Received',
  paid: 'Paid',
  posted: 'Posted',
}

const STAGE_COLORS: Record<string, string> = {
  contacted: '#94a3b8',
  brief_sent: '#60a5fa',
  content_received: '#fbbf24',
  w9_done: '#a78bfa',
  invoice_received: '#fb923c',
  paid: '#34d399',
  posted: '#FF0080',
}

// --- Component ---

export default function ReportsPage() {
  const { selectedBrand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SummaryStats>({
    totalCampaigns: 0,
    totalInfluencers: 0,
    totalBudget: 0,
    totalPaid: 0,
  })
  const [campaignRows, setCampaignRows] = useState<CampaignRow[]>([])
  const [pipelineCounts, setPipelineCounts] = useState<PipelineCount[]>([])
  const [topInfluencers, setTopInfluencers] = useState<TopInfluencer[]>([])

  useEffect(() => {
    async function fetchReports() {
      setLoading(true)
      const supabase = createClient()
      const brandId = selectedBrand?.id

      if (!brandId) {
        setLoading(false)
        return
      }

      // Fetch all campaigns for this brand
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('*')
        .eq('brand_id', brandId)

      const allCampaigns = campaigns ?? []
      const campaignIds = allCampaigns.map((c) => c.id)

      // Fetch all campaign_influencers for these campaigns
      let allCIs: Array<{
        id: string
        campaign_id: string
        influencer_id: string
        pipeline_stage: string
      }> = []
      if (campaignIds.length > 0) {
        const { data: ciData } = await supabase
          .from('campaign_influencers')
          .select('id, campaign_id, influencer_id, pipeline_stage')
          .in('campaign_id', campaignIds)
        allCIs = ciData ?? []
      }

      // Fetch all payments for these campaign_influencers
      const ciIds = allCIs.map((ci) => ci.id)
      let allPayments: Array<{
        campaign_influencer_id: string
        amount: number | null
      }> = []
      if (ciIds.length > 0) {
        const { data: paymentData } = await supabase
          .from('payments')
          .select('campaign_influencer_id, amount')
          .in('campaign_influencer_id', ciIds)
        allPayments = paymentData ?? []
      }

      // --- Summary Stats ---
      const totalCampaigns = allCampaigns.length
      const uniqueInfluencerIds = new Set(allCIs.map((ci) => ci.influencer_id))
      const totalInfluencers = uniqueInfluencerIds.size
      const totalBudget = allCampaigns.reduce(
        (sum, c) => sum + (c.budget ?? 0),
        0
      )
      const totalPaid = allPayments.reduce(
        (sum, p) => sum + (p.amount ?? 0),
        0
      )
      setStats({ totalCampaigns, totalInfluencers, totalBudget, totalPaid })

      // --- Campaign Performance Rows ---
      // Build payment totals by campaign_influencer_id
      const paymentByCiId: Record<string, number> = {}
      for (const p of allPayments) {
        paymentByCiId[p.campaign_influencer_id] =
          (paymentByCiId[p.campaign_influencer_id] ?? 0) + (p.amount ?? 0)
      }

      const rows: CampaignRow[] = allCampaigns.map((campaign) => {
        const campaignCIs = allCIs.filter(
          (ci) => ci.campaign_id === campaign.id
        )
        const influencerCount = campaignCIs.length
        const paidOut = campaignCIs.reduce(
          (sum, ci) => sum + (paymentByCiId[ci.id] ?? 0),
          0
        )
        const postedCount = campaignCIs.filter(
          (ci) => ci.pipeline_stage === 'posted'
        ).length
        const completionRate =
          influencerCount > 0
            ? Math.round((postedCount / influencerCount) * 100)
            : 0

        return {
          id: campaign.id,
          name: campaign.name,
          retailer: campaign.retailer,
          quarter: campaign.quarter,
          influencerCount,
          budget: campaign.budget ?? 0,
          paidOut,
          completionRate,
        }
      })

      // Sort by quarter descending, then name
      rows.sort((a, b) => {
        const qA = a.quarter ?? ''
        const qB = b.quarter ?? ''
        if (qB !== qA) return qB.localeCompare(qA)
        return a.name.localeCompare(b.name)
      })
      setCampaignRows(rows)

      // --- Pipeline Distribution (active campaigns only) ---
      const activeCampaignIds = allCampaigns
        .filter((c) => c.status === 'active')
        .map((c) => c.id)
      const activeCIs = allCIs.filter((ci) =>
        activeCampaignIds.includes(ci.campaign_id)
      )

      const stageCounts: Record<string, number> = {}
      for (const stage of PIPELINE_STAGES) {
        stageCounts[stage] = 0
      }
      for (const ci of activeCIs) {
        if (stageCounts[ci.pipeline_stage] !== undefined) {
          stageCounts[ci.pipeline_stage]++
        }
      }
      setPipelineCounts(
        PIPELINE_STAGES.map((stage) => ({
          stage,
          count: stageCounts[stage],
        }))
      )

      // --- Top Influencers ---
      // Group CIs by influencer_id
      const influencerMap: Record<
        string,
        { campaignIds: Set<string>; payments: number; stageIndexSum: number; count: number }
      > = {}
      for (const ci of allCIs) {
        if (!influencerMap[ci.influencer_id]) {
          influencerMap[ci.influencer_id] = {
            campaignIds: new Set(),
            payments: 0,
            stageIndexSum: 0,
            count: 0,
          }
        }
        const entry = influencerMap[ci.influencer_id]
        entry.campaignIds.add(ci.campaign_id)
        entry.payments += paymentByCiId[ci.id] ?? 0
        const stageIdx = PIPELINE_STAGES.indexOf(
          ci.pipeline_stage as (typeof PIPELINE_STAGES)[number]
        )
        entry.stageIndexSum += stageIdx >= 0 ? stageIdx : 0
        entry.count++
      }

      // Sort by campaign count descending, take top 10
      const sortedInfluencerIds = Object.entries(influencerMap)
        .sort((a, b) => b[1].campaignIds.size - a[1].campaignIds.size)
        .slice(0, 10)
        .map(([id]) => id)

      // Fetch influencer details
      let influencerDetails: Array<{
        id: string
        name: string
        handle: string | null
      }> = []
      if (sortedInfluencerIds.length > 0) {
        const { data: infData } = await supabase
          .from('influencers')
          .select('id, name, handle')
          .in('id', sortedInfluencerIds)
        influencerDetails = infData ?? []
      }

      const detailMap = Object.fromEntries(
        influencerDetails.map((i) => [i.id, i])
      )

      const topInf: TopInfluencer[] = sortedInfluencerIds
        .map((id) => {
          const entry = influencerMap[id]
          const detail = detailMap[id]
          return {
            id,
            name: detail?.name ?? 'Unknown',
            handle: detail?.handle ?? null,
            campaignCount: entry.campaignIds.size,
            totalEarned: entry.payments,
            avgStageIndex:
              entry.count > 0
                ? Math.round(entry.stageIndexSum / entry.count)
                : 0,
          }
        })
        .sort((a, b) => b.campaignCount - a.campaignCount)

      setTopInfluencers(topInf)

      setLoading(false)
    }

    fetchReports()
  }, [selectedBrand])

  const summaryCards = [
    {
      label: 'Total Campaigns',
      value: stats.totalCampaigns.toString(),
      icon: Megaphone,
      color: '#1A6BFF',
    },
    {
      label: 'Total Influencers Used',
      value: stats.totalInfluencers.toString(),
      icon: Users,
      color: '#FF0080',
    },
    {
      label: 'Total Budget',
      value: `$${stats.totalBudget.toLocaleString()}`,
      icon: TrendingUp,
      color: '#059669',
    },
    {
      label: 'Total Paid',
      value: `$${stats.totalPaid.toLocaleString()}`,
      icon: DollarSign,
      color: '#f59e0b',
    },
  ]

  const pipelineTotal = pipelineCounts.reduce((sum, p) => sum + p.count, 0)

  return (
    <>
      <Topbar title="Reports" />

      <div className="flex-1 overflow-y-auto bg-[#fafaf9]">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 px-6 mt-6">
          {summaryCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm"
                style={{ borderLeft: `4px solid ${card.color}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color: card.color }} className="opacity-70">
                    <Icon size={18} />
                  </span>
                </div>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">{card.label}</p>
              </div>
            )
          })}
        </div>

        {/* Campaign Performance Table */}
        <div className="px-6 mt-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <BarChart3 size={16} className="text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">
                Campaign Performance
              </h3>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 bg-gray-50 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : campaignRows.length === 0 ? (
              <div className="p-8 text-center">
                <Megaphone size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-base text-gray-400">
                  No campaigns found for this brand
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Campaign
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Retailer
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Quarter
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                        Influencers
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                        Budget
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                        Paid Out
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Completion Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaignRows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">
                          {row.name}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {row.retailer ?? '-'}
                        </td>
                        <td className="px-5 py-3">
                          {row.quarter ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#eff6ff] text-[#2563eb]">
                              {row.quarter}
                            </span>
                          ) : (
                            <span className="text-base text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-center">
                          {row.influencerCount}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">
                          ${row.budget.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">
                          ${row.paidOut.toLocaleString()}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${row.completionRate}%`,
                                  backgroundColor: '#34d399',
                                }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-8 text-right">
                              {row.completionRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Distribution + Top Influencers */}
        <div className="grid grid-cols-2 gap-6 px-6 mt-6 pb-6">
          {/* Pipeline Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <TrendingUp size={16} className="text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">
                Pipeline Distribution
              </h3>
              <span className="ml-auto text-xs text-gray-400">
                Active campaigns only
              </span>
            </div>
            {loading ? (
              <div className="p-5">
                <div className="h-8 bg-gray-50 rounded animate-pulse" />
              </div>
            ) : pipelineTotal === 0 ? (
              <div className="p-8 text-center">
                <BarChart3 size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-base text-gray-400">
                  No active pipeline data
                </p>
              </div>
            ) : (
              <div className="p-5">
                {/* Stacked Bar */}
                <div className="flex h-10 rounded-lg overflow-hidden">
                  {pipelineCounts.map(
                    (p) =>
                      p.count > 0 && (
                        <div
                          key={p.stage}
                          className="flex items-center justify-center text-[11px] font-bold text-white transition-all"
                          style={{
                            width: `${(p.count / pipelineTotal) * 100}%`,
                            backgroundColor: STAGE_COLORS[p.stage],
                            minWidth: p.count > 0 ? '24px' : '0',
                          }}
                          title={`${STAGE_LABELS[p.stage]}: ${p.count}`}
                        >
                          {p.count}
                        </div>
                      )
                  )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
                  {pipelineCounts.map((p) => (
                    <div key={p.stage} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{
                          backgroundColor: STAGE_COLORS[p.stage],
                        }}
                      />
                      <span className="text-xs text-gray-600">
                        {STAGE_LABELS[p.stage]}
                      </span>
                      <span className="text-xs font-medium text-gray-900">
                        ({p.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top Influencers */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Crown size={16} className="text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">
                Top Influencers
              </h3>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 bg-gray-50 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : topInfluencers.length === 0 ? (
              <div className="p-8 text-center">
                <Users size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-base text-gray-400">
                  No influencer data yet
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Handle
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                        Campaigns
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                        Total Earned
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Avg Stage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {topInfluencers.map((inf) => (
                      <tr
                        key={inf.id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                              <span className="text-white text-[11px] font-bold">
                                {inf.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {inf.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500 font-mono">
                          {inf.handle ? `@${inf.handle}` : '-'}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-center">
                          {inf.campaignCount}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">
                          ${inf.totalEarned.toLocaleString()}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                            style={{
                              backgroundColor:
                                STAGE_COLORS[
                                  PIPELINE_STAGES[inf.avgStageIndex]
                                ] ?? '#94a3b8',
                            }}
                          >
                            {STAGE_LABELS[
                              PIPELINE_STAGES[inf.avgStageIndex]
                            ] ?? 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
