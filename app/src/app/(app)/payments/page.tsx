'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { FileText, Loader2, ChevronDown, Check } from 'lucide-react'
import Topbar from '@/components/topbar'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

// --- Types ---

interface PaymentQueueItem {
  id: string
  influencer_id: string
  campaign_id: string
  name: string
  handle: string | null
  campaign_name: string
  w9_status: string
  invoice_status: string
  payment_status: string
  rate: number | null
  pipeline_stage: string
  ready_to_pay: boolean
}

type StatusField = 'w9_status' | 'invoice_status' | 'payment_status'

// --- Status options per field ---

const W9_OPTIONS = ['not_required', 'pending', 'sent', 'received', 'complete'] as const
const INVOICE_OPTIONS = ['pending', 'sent', 'received', 'paid'] as const
const PAYMENT_OPTIONS = ['unpaid', 'processing', 'paid'] as const
const PIPELINE_OPTIONS = ['content_received', 'w9_done', 'invoice_received'] as const

// --- Status pill color map ---

function getPillColors(status: string): { bg: string; text: string } {
  switch (status) {
    case 'not_required':
      return { bg: '#f1f5f9', text: '#64748b' }
    case 'pending':
      return { bg: '#fefce8', text: '#a16207' }
    case 'sent':
    case 'requested':
      return { bg: '#eff6ff', text: '#2563eb' }
    case 'received':
      return { bg: '#ecfdf5', text: '#059669' }
    case 'complete':
      return { bg: '#d1fae5', text: '#047857' }
    case 'paid':
      return { bg: '#ecfdf5', text: '#059669' }
    case 'unpaid':
      return { bg: '#f1f5f9', text: '#64748b' }
    case 'processing':
      return { bg: '#fefce8', text: '#a16207' }
    default:
      return { bg: '#f1f5f9', text: '#64748b' }
  }
}

function formatLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// --- StatusPill (read-only) ---

function StatusPill({ status }: { status: string }) {
  const { bg, text } = getPillColors(status)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {formatLabel(status)}
    </span>
  )
}

// --- EditableStatusPill (click to open dropdown, saves to Supabase) ---

function EditableStatusPill({
  status,
  options,
  onSave,
}: {
  status: string
  options: readonly string[]
  onSave: (newValue: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const { bg, text } = getPillColors(status)

  async function handleSelect(value: string) {
    if (value === status) {
      setOpen(false)
      return
    }
    setSaving(true)
    await onSave(value)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition-all disabled:opacity-50"
        style={{ backgroundColor: bg, color: text }}
      >
        {saving ? (
          <Loader2 size={10} className="animate-spin" />
        ) : (
          formatLabel(status)
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[130px]">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getPillColors(opt).text }}
              />
              {formatLabel(opt)}
              {opt === status && <Check size={10} className="ml-auto text-gray-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- FilterableHeader (click to filter by column values) ---

function FilterableHeader({
  label,
  options,
  activeFilter,
  onFilter,
}: {
  label: string
  options: readonly string[]
  activeFilter: string | null
  onFilter: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const isActive = activeFilter !== null

  return (
    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-1 hover:text-gray-800 transition-colors ${
            isActive ? 'text-[#1A6BFF] border-b-2 border-[#1A6BFF] pb-0.5' : ''
          }`}
        >
          {label}
          <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-2 left-0 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[140px] normal-case font-normal">
            <button
              onClick={() => { onFilter(null); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 transition-colors text-left ${
                !isActive ? 'text-[#1A6BFF] font-medium' : 'text-gray-700'
              }`}
            >
              All
              {!isActive && <Check size={10} className="ml-auto" />}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onFilter(opt); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 transition-colors text-left ${
                  activeFilter === opt ? 'text-[#1A6BFF] font-medium' : 'text-gray-700'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getPillColors(opt).text }}
                />
                {formatLabel(opt)}
                {activeFilter === opt && <Check size={10} className="ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </th>
  )
}

// --- Main Page ---

export default function PaymentQueuePage() {
  const { selectedBrand } = useBrand()
  const [items, setItems] = useState<PaymentQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestingInvoice, setRequestingInvoice] = useState<string | null>(null)
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)

  // Column filters
  const [w9Filter, setW9Filter] = useState<string | null>(null)
  const [invoiceFilter, setInvoiceFilter] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null)
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let campaignQuery = supabase.from('campaigns').select('id, name')
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

    const { data: ciData, error: ciErr } = await supabase
      .from('campaign_influencers')
      .select('id, campaign_id, influencer_id, pipeline_stage, w9_status, invoice_status, payment_status')
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
        payment_status: ci.payment_status ?? 'unpaid',
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
  }, [selectedBrand])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Inline status update - saves to Supabase and updates local state
  async function handleStatusUpdate(ciId: string, field: StatusField, newValue: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('campaign_influencers')
      .update({ [field]: newValue })
      .eq('id', ciId)

    if (error) {
      console.error(`Failed to update ${field}:`, error.message)
      return
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== ciId) return item
        const updated = { ...item, [field]: newValue }
        updated.ready_to_pay = updated.w9_status === 'received' && updated.invoice_status === 'received'
        return updated
      })
    )
  }

  // Request Invoice -> sets invoice_status to 'sent'
  async function handleRequestInvoice(ciId: string) {
    setRequestingInvoice(ciId)

    const supabase = createClient()
    const { error } = await supabase
      .from('campaign_influencers')
      .update({ invoice_status: 'sent' })
      .eq('id', ciId)

    if (error) {
      console.error('Failed to request invoice:', error.message)
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === ciId ? { ...item, invoice_status: 'sent' } : item
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

  // Apply filters
  const filteredItems = items.filter((item) => {
    if (w9Filter && item.w9_status !== w9Filter) return false
    if (invoiceFilter && item.invoice_status !== invoiceFilter) return false
    if (paymentFilter && item.payment_status !== paymentFilter) return false
    if (pipelineFilter && item.pipeline_stage !== pipelineFilter) return false
    return true
  })

  return (
    <>
      <Topbar title="Payment Queue" />

      <div className="flex-1 overflow-y-auto bg-[#fafaf9] p-6">
        {/* Active filter count indicator */}
        {(w9Filter || invoiceFilter || paymentFilter || pipelineFilter) && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] text-gray-500">
              Filters active: showing {filteredItems.length} of {items.length}
            </span>
            <button
              onClick={() => { setW9Filter(null); setInvoiceFilter(null); setPaymentFilter(null); setPipelineFilter(null) }}
              className="text-[11px] text-[#1A6BFF] hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

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
                <FilterableHeader
                  label="W9 Status"
                  options={W9_OPTIONS}
                  activeFilter={w9Filter}
                  onFilter={setW9Filter}
                />
                <FilterableHeader
                  label="Invoice Status"
                  options={INVOICE_OPTIONS}
                  activeFilter={invoiceFilter}
                  onFilter={setInvoiceFilter}
                />
                <FilterableHeader
                  label="Payment Status"
                  options={PAYMENT_OPTIONS}
                  activeFilter={paymentFilter}
                  onFilter={setPaymentFilter}
                />
                <FilterableHeader
                  label="Pipeline Stage"
                  options={PIPELINE_OPTIONS}
                  activeFilter={pipelineFilter}
                  onFilter={setPipelineFilter}
                />
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
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <p className="text-sm text-gray-400">Loading payment queue...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <FileText size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">
                      {items.length === 0
                        ? 'No influencers in the payment queue'
                        : 'No results match the active filters'}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {items.length === 0
                        ? 'Influencers appear here after content is received'
                        : 'Try adjusting your filters above'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
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
                      <EditableStatusPill
                        status={item.w9_status}
                        options={W9_OPTIONS}
                        onSave={(val) => handleStatusUpdate(item.id, 'w9_status', val)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <EditableStatusPill
                        status={item.invoice_status}
                        options={INVOICE_OPTIONS}
                        onSave={(val) => handleStatusUpdate(item.id, 'invoice_status', val)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <EditableStatusPill
                        status={item.payment_status}
                        options={PAYMENT_OPTIONS}
                        onSave={(val) => handleStatusUpdate(item.id, 'payment_status', val)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.pipeline_stage} />
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
                      ) : item.invoice_status === 'sent' ? (
                        <span className="text-[10px] text-gray-400">
                          Invoice sent
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
        onUpdate={fetchQueue}
      />
    </>
  )
}
