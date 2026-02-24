'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Send, Clock, X, Mail } from 'lucide-react'
import Topbar from '@/components/topbar'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

interface ChaseItem {
  id: string
  influencer_id: string
  name: string
  handle: string | null
  email: string | null
  pipeline_stage: string
  deliverable: string | null
  campaign_name: string
  posting_deadline: string
  days_overdue: number
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

export default function ChaseListPage() {
  const { selectedBrand } = useBrand()
  const [items, setItems] = useState<ChaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)
  const [showEmailPreview, setShowEmailPreview] = useState(false)

  useEffect(() => {
    async function fetchChaseList() {
      setLoading(true)
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      // Get campaigns with past deadlines for selected brand
      let campaignQuery = supabase
        .from('campaigns')
        .select('id, name, posting_deadline')
        .lt('posting_deadline', today)

      if (selectedBrand?.id) {
        campaignQuery = campaignQuery.eq('brand_id', selectedBrand.id)
      }

      const { data: campaigns, error: campErr } = await campaignQuery

      if (campErr) {
        console.error('Failed to fetch campaigns:', campErr.message)
        setLoading(false)
        return
      }

      if (!campaigns || campaigns.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const campaignIds = campaigns.map((c) => c.id)
      const campaignMap = Object.fromEntries(
        campaigns.map((c) => [c.id, { name: c.name, deadline: c.posting_deadline }])
      )

      // Get overdue campaign_influencers
      const { data: ciData, error: ciErr } = await supabase
        .from('campaign_influencers')
        .select('id, campaign_id, influencer_id, pipeline_stage, deliverable')
        .in('campaign_id', campaignIds)
        .in('pipeline_stage', ['contacted', 'brief_sent'])

      if (ciErr) {
        console.error('Failed to fetch chase items:', ciErr.message)
        setLoading(false)
        return
      }

      if (!ciData || ciData.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const influencerIds = [...new Set(ciData.map((ci) => ci.influencer_id))]
      const { data: influencers } = await supabase
        .from('influencers')
        .select('id, name, handle, email')
        .in('id', influencerIds)

      const influencerMap = Object.fromEntries(
        (influencers ?? []).map((i) => [i.id, i])
      )

      const todayDate = new Date(today)
      const chaseItems: ChaseItem[] = ciData.map((ci) => {
        const inf = influencerMap[ci.influencer_id]
        const campaign = campaignMap[ci.campaign_id]
        const deadlineDate = new Date(campaign?.deadline ?? today)
        const daysOverdue = Math.floor(
          (todayDate.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        return {
          id: ci.id,
          influencer_id: ci.influencer_id,
          name: inf?.name ?? 'Unknown',
          handle: inf?.handle ?? null,
          email: inf?.email ?? null,
          pipeline_stage: ci.pipeline_stage,
          deliverable: ci.deliverable,
          campaign_name: campaign?.name ?? 'Unknown',
          posting_deadline: campaign?.deadline ?? today,
          days_overdue: Math.max(0, daysOverdue),
        }
      })

      // Sort by most overdue first
      chaseItems.sort((a, b) => b.days_overdue - a.days_overdue)

      setItems(chaseItems)
      setLoading(false)
    }

    fetchChaseList()
  }, [selectedBrand])

  return (
    <>
      <Topbar title="Chase List">
        {items.length > 0 && (
          <button
            onClick={() => setShowEmailPreview(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#f59e0b] text-white text-xs font-medium rounded-lg hover:bg-[#d97706] transition-colors"
          >
            <Send size={14} />
            Send All Reminders
          </button>
        )}
      </Topbar>

      <div className="flex-1 overflow-y-auto bg-[#fafaf9] p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-400">Loading chase list...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <AlertTriangle size={32} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No overdue influencers</p>
            <p className="text-xs text-gray-300 mt-1">
              All influencers are on track
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
                style={{ borderLeft: '3px solid #f59e0b' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <button
                      onClick={() => setSelectedInfluencerId(item.influencer_id)}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0"
                    >
                      <span className="text-white text-xs font-bold">
                        {getInitials(item.name)}
                      </span>
                    </button>

                    {/* Details */}
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedInfluencerId(item.influencer_id)}
                          className="text-sm font-semibold text-gray-900 hover:underline"
                        >
                          {item.name}
                        </button>
                        {item.handle && (
                          <span className="text-xs text-gray-400 font-mono">
                            @{item.handle}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5">
                        {item.deliverable && (
                          <span className="text-xs text-gray-500">
                            {item.deliverable}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {item.campaign_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-gray-400 capitalize">
                          {formatStageName(item.pipeline_stage)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {/* Days overdue badge */}
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fefce8]">
                      <Clock size={11} className="text-[#a16207]" />
                      <span className="text-[10px] font-medium text-[#a16207]">
                        {item.days_overdue}d overdue
                      </span>
                    </div>

                    {/* Send Reminder */}
                    <button
                      onClick={() => setShowEmailPreview(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f59e0b] text-white text-xs font-medium rounded-lg hover:bg-[#d97706] transition-colors"
                    >
                      <Send size={12} />
                      Send Reminder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Preview Modal (Phase 2 placeholder) */}
      {showEmailPreview && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={() => setShowEmailPreview(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-gray-500" />
                  <h2 className="text-sm font-bold text-gray-900">
                    Email Preview
                  </h2>
                </div>
                <button
                  onClick={() => setShowEmailPreview(false)}
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <Mail size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-700">
                    Email Preview - Phase 2
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Automated email reminders will be available in the next phase.
                    For now, reach out directly via the influencer&apos;s contact info.
                  </p>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <ProfilePanel
        influencerId={selectedInfluencerId}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </>
  )
}
