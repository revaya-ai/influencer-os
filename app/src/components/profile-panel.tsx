'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Mail, MapPin, Globe, Star, DollarSign, Megaphone, UserPlus, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/lib/types/database'

interface CampaignHistory {
  id: string
  campaign_name: string
  pipeline_stage: string
  deliverable: string | null
  created_at: string
  updated_at: string
}

interface ProfilePanelProps {
  influencerId: string | null
  onClose: () => void
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatStageName(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function ProfilePanel({ influencerId, onClose }: ProfilePanelProps) {
  const [influencer, setInfluencer] = useState<Tables<'influencers'> | null>(null)
  const [history, setHistory] = useState<CampaignHistory[]>([])
  const [stats, setStats] = useState({ campaigns: 0, avgRating: 0, totalEarned: 0 })
  const [currentCampaign, setCurrentCampaign] = useState<CampaignHistory | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!influencerId) return

    async function fetchProfile() {
      setLoading(true)
      const supabase = createClient()

      // Fetch influencer details
      const { data: inf, error: infErr } = await supabase
        .from('influencers')
        .select('*')
        .eq('id', influencerId!)
        .single()

      if (infErr || !inf) {
        console.error('Failed to fetch influencer:', infErr?.message)
        setLoading(false)
        return
      }

      setInfluencer(inf)
      setNotes(inf.notes ?? '')

      // Fetch campaign history
      const { data: ciData, error: ciErr } = await supabase
        .from('campaign_influencers')
        .select('id, campaign_id, pipeline_stage, deliverable, created_at, updated_at')
        .eq('influencer_id', influencerId!)
        .order('created_at', { ascending: false })

      if (ciErr) {
        console.error('Failed to fetch campaign history:', ciErr.message)
        setLoading(false)
        return
      }

      const campaignIds = [...new Set((ciData ?? []).map((ci) => ci.campaign_id))]

      let campaignsMap: Record<string, string> = {}
      if (campaignIds.length > 0) {
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, name')
          .in('id', campaignIds)

        if (campaigns) {
          campaignsMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]))
        }
      }

      const historyItems: CampaignHistory[] = (ciData ?? []).map((ci) => ({
        id: ci.id,
        campaign_name: campaignsMap[ci.campaign_id] ?? 'Unknown Campaign',
        pipeline_stage: ci.pipeline_stage,
        deliverable: ci.deliverable,
        created_at: ci.created_at,
        updated_at: ci.updated_at,
      }))

      setHistory(historyItems)

      // Set current campaign (most recent non-posted)
      const active = historyItems.find((h) => h.pipeline_stage !== 'posted')
      setCurrentCampaign(active ?? historyItems[0] ?? null)

      // Fetch payments for total earned
      const ciIds = (ciData ?? []).map((ci) => ci.id)
      let totalEarned = 0
      if (ciIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .in('campaign_influencer_id', ciIds)

        if (payments) {
          totalEarned = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0)
        }
      }

      setStats({
        campaigns: campaignIds.length,
        avgRating: inf.performance_rating ?? 0,
        totalEarned,
      })

      setLoading(false)
    }

    fetchProfile()
  }, [influencerId])

  const handleNotesBlur = useCallback(async () => {
    if (!influencerId || !influencer) return
    if (notes === (influencer.notes ?? '')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('influencers')
      .update({ notes })
      .eq('id', influencerId)

    if (error) {
      console.error('Failed to save notes:', error.message)
    }
  }, [influencerId, influencer, notes])

  if (!influencerId) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                <span className="text-white text-lg font-bold">
                  {influencer ? getInitials(influencer.name) : '..'}
                </span>
              </div>
              <div>
                {loading ? (
                  <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
                ) : (
                  <>
                    <h2 className="text-base font-bold text-gray-900">
                      {influencer?.name}
                    </h2>
                    {influencer?.handle && (
                      <p className="text-xs text-gray-400 font-mono">
                        @{influencer.handle}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading profile...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 p-6">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Megaphone size={14} className="text-[#1A6BFF]" />
                </div>
                <p className="text-lg font-bold text-gray-900">{stats.campaigns}</p>
                <p className="text-[10px] text-gray-500">Campaigns</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Star size={14} className="text-[#f59e0b]" />
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '-'}
                </p>
                <p className="text-[10px] text-gray-500">Avg Rating</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center mb-1">
                  <DollarSign size={14} className="text-[#059669]" />
                </div>
                <p className="text-lg font-bold text-gray-900">
                  ${stats.totalEarned.toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500">Total Earned</p>
              </div>
            </div>

            {/* Contact Info */}
            <div className="px-6 pb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Contact Info
              </h3>
              <div className="space-y-2">
                {influencer?.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{influencer.email}</span>
                  </div>
                )}
                {influencer?.platform && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Globe size={14} className="text-gray-400 shrink-0" />
                    <span className="capitalize">{influencer.platform}</span>
                  </div>
                )}
                {influencer?.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <span>{influencer.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Current Campaign */}
            {currentCampaign && (
              <div className="px-6 pb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Current Campaign
                </h3>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {currentCampaign.campaign_name}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                      style={{
                        backgroundColor:
                          STAGE_COLORS[currentCampaign.pipeline_stage] ?? '#94a3b8',
                      }}
                    >
                      {formatStageName(currentCampaign.pipeline_stage)}
                    </span>
                    {currentCampaign.deliverable && (
                      <span className="text-xs text-gray-500">
                        {currentCampaign.deliverable}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Campaign History */}
            {history.length > 0 && (
              <div className="px-6 pb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Campaign History
                </h3>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          Campaign
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          Stage
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-t border-gray-50">
                          <td className="px-3 py-2 text-gray-700">
                            {h.campaign_name}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{
                                backgroundColor:
                                  STAGE_COLORS[h.pipeline_stage] ?? '#94a3b8',
                              }}
                            >
                              {formatStageName(h.pipeline_stage)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {new Date(h.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="px-6 pb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Notes
              </h3>
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                rows={4}
                placeholder="Add notes about this influencer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1A6BFF] text-white text-xs font-medium rounded-lg hover:bg-[#1558d4] transition-colors">
                <UserPlus size={14} />
                Add to Campaign
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                <Pencil size={14} />
                Edit Profile
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  )
}
