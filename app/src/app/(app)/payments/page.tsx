'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import Topbar from '@/components/topbar'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

interface PaymentQueueItem {
  id: string
  influencer_id: string
  campaign_id: string
  name: string
  handle: string | null
  campaign_name: string
  w9_status: string
  invoice_status: string
  rate: number | null
  pipeline_stage: string
  ready_to_pay: boolean
}

function StatusPill({ status, type }: { status: string; type: 'w9' | 'invoice' }) {
  let bg = '#fefce8'
  let text = '#a16207'

  if (status === 'received') {
    bg = '#ecfdf5'
    text = '#059669'
  } else if (status === 'requested') {
    bg = '#eff6ff'
    text = '#2563eb'
  } else if (status === 'pending') {
    bg = '#fefce8'
    text = '#a16207'
  }

  const label = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

export default function PaymentQueuePage() {
  const { selectedBrand } = useBrand()
  const [items, setItems] = useState<PaymentQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestingInvoice, setRequestingInvoice] = useState<string | null>(null)
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchQueue() {
      setLoading(true)
      const supabase = createClient()

      // Get active campaigns for brand
      let campaignQuery = supabase
        .from('campaigns')
        .select('id, name')

      if (selectedBrand?.id) {
        campaignQuery = campaignQuery.eq('brand_id', selectedBrand.id)
      }

      const { data: campaigns, error: campErr } = await campaignQuery

      if (campErr) {
        console.error('Failed to fetch campaigns:', campErr.message)
        setLoading(false)
        return
      }

      const campaignIds = (campaigns ?? []).map((c) => c.id)
      const campaignMap = Object.fromEntries(
        (campaigns ?? []).map((c) => [c.id, c.name])
      )

      if (campaignIds.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      // Get campaign_influencers in payment-related stages
      const { data: ciData, error: ciErr } = await supabase
        .from('campaign_influencers')
        .select('id, campaign_id, influencer_id, pipeline_stage, w9_status, invoice_status')
        .in('campaign_id', campaignIds)
        .in('pipeline_stage', ['content_received', 'w9_done', 'invoice_received'])

      if (ciErr) {
        console.error('Failed to fetch payment queue:', ciErr.message)
        setLoading(false)
        return
      }

      const influencerIds = [...new Set((ciData ?? []).map((ci) => ci.influencer_id))]

      let influencerMap: Record<string, { name: string; handle: string | null; rate: number | null }> = {}
      if (influencerIds.length > 0) {
        const { data: influencers } = await supabase
          .from('influencers')
          .select('id, name, handle, rate')
          .in('id', influencerIds)

        if (influencers) {
          influencerMap = Object.fromEntries(
            influencers.map((i) => [i.id, { name: i.name, handle: i.handle, rate: i.rate }])
          )
        }
      }

      const queueItems: PaymentQueueItem[] = (ciData ?? []).map((ci) => {
        const inf = influencerMap[ci.influencer_id] ?? { name: 'Unknown', handle: null, rate: null }
        const readyToPay = ci.w9_status === 'received' && ci.invoice_status === 'received'

        return {
          id: ci.id,
          influencer_id: ci.influencer_id,
          campaign_id: ci.campaign_id,
          name: inf.name,
          handle: inf.handle,
          campaign_name: campaignMap[ci.campaign_id] ?? 'Unknown',
          w9_status: ci.w9_status,
          invoice_status: ci.invoice_status,
          rate: inf.rate,
          pipeline_stage: ci.pipeline_stage,
          ready_to_pay: readyToPay,
        }
      })

      // Sort: ready-to-pay items at top
      queueItems.sort((a, b) => {
        if (a.ready_to_pay && !b.ready_to_pay) return -1
        if (!a.ready_to_pay && b.ready_to_pay) return 1
        return 0
      })

      setItems(queueItems)
      setLoading(false)
    }

    fetchQueue()
  }, [selectedBrand])

  async function handleRequestInvoice(ciId: string) {
    setRequestingInvoice(ciId)

    const supabase = createClient()
    const { error } = await supabase
      .from('campaign_influencers')
      .update({ invoice_status: 'requested' })
      .eq('id', ciId)

    if (error) {
      console.error('Failed to request invoice:', error.message)
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === ciId ? { ...item, invoice_status: 'requested' } : item
        )
      )
    }

    setRequestingInvoice(null)
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      <Topbar title="Payment Queue" />

      <div className="flex-1 overflow-y-auto bg-[#fafaf9] p-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Handle
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  W9 Status
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Invoice Status
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-400">Loading payment queue...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FileText size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">
                      No influencers in the payment queue
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      Influencers appear here after content is received
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${
                      item.ready_to_pay ? 'bg-[#ecfdf5]/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedInfluencerId(item.influencer_id)}
                        className="flex items-center gap-2.5 hover:underline"
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">
                            {getInitials(item.name)}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-gray-900">
                          {item.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {item.handle ? `@${item.handle}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {item.campaign_name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.w9_status} type="w9" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.invoice_status} type="invoice" />
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-900">
                      {item.rate != null ? `$${item.rate.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.ready_to_pay ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-medium bg-[#ecfdf5] text-[#059669]">
                          Ready to Pay
                        </span>
                      ) : item.invoice_status === 'pending' ? (
                        <button
                          onClick={() => handleRequestInvoice(item.id)}
                          disabled={requestingInvoice === item.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-[#1A6BFF] bg-[#eff6ff] rounded hover:bg-[#dbeafe] disabled:opacity-50 transition-colors"
                        >
                          {requestingInvoice === item.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <FileText size={10} />
                          )}
                          Request Invoice
                        </button>
                      ) : item.invoice_status === 'requested' ? (
                        <span className="text-[10px] text-gray-400">
                          Invoice requested
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProfilePanel
        influencerId={selectedInfluencerId}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </>
  )
}
