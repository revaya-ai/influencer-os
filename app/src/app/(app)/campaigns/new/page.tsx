'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, Plus, Trash2 } from 'lucide-react'
import Topbar from '@/components/topbar'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'
import type { Tables } from '@/lib/types/database'

interface AssignedInfluencer {
  id: string
  name: string
  handle: string | null
  rate: number | null
  deliverable: string
}

const currentYear = new Date().getFullYear()
const QUARTERS = [
  `Q1 ${currentYear}`,
  `Q2 ${currentYear}`,
  `Q3 ${currentYear}`,
  `Q4 ${currentYear}`,
  `Q1 ${currentYear + 1}`,
  `Q2 ${currentYear + 1}`,
]

export default function NewCampaignPage() {
  const router = useRouter()
  const { selectedBrand, brands } = useBrand()

  const [form, setForm] = useState({
    brand_id: '',
    retailer: '',
    region: '',
    name: '',
    quarter: QUARTERS[0],
    products: '',
    budget: '',
    posting_deadline: '',
  })

  const [influencers, setInfluencers] = useState<Tables<'influencers'>[]>([])
  const [assigned, setAssigned] = useState<AssignedInfluencer[]>([])
  const [influencerSearch, setInfluencerSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Set brand_id from context
  useEffect(() => {
    if (selectedBrand?.id && !form.brand_id) {
      setForm((prev) => ({ ...prev, brand_id: selectedBrand.id }))
    }
  }, [selectedBrand])

  // Fetch influencers for assignment
  useEffect(() => {
    async function fetchInfluencers() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('influencers')
        .select('*')
        .order('name')

      if (error) {
        console.error('Failed to fetch influencers:', error.message)
        return
      }

      setInfluencers(data ?? [])
    }

    fetchInfluencers()
  }, [])

  const selectedBrandObj = brands.find((b) => b.id === form.brand_id)
  const isMissJones = selectedBrandObj?.name?.toLowerCase().includes('miss jones')
  const isWineAndCola = selectedBrandObj?.name?.toLowerCase().includes('wine') && selectedBrandObj?.name?.toLowerCase().includes('cola')

  // Filter influencers by search, exclude already assigned
  const searchResults = useMemo(() => {
    if (!influencerSearch.trim()) return []

    const lower = influencerSearch.toLowerCase()
    const assignedIds = new Set(assigned.map((a) => a.id))

    return influencers
      .filter(
        (i) =>
          !assignedIds.has(i.id) &&
          (i.name.toLowerCase().includes(lower) ||
            (i.handle && i.handle.toLowerCase().includes(lower)))
      )
      .slice(0, 10)
  }, [influencerSearch, influencers, assigned])

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addInfluencer(inf: Tables<'influencers'>) {
    setAssigned((prev) => [
      ...prev,
      {
        id: inf.id,
        name: inf.name,
        handle: inf.handle,
        rate: inf.rate,
        deliverable: '',
      },
    ])
    setInfluencerSearch('')
  }

  function removeInfluencer(id: string) {
    setAssigned((prev) => prev.filter((a) => a.id !== id))
  }

  function updateDeliverable(id: string, deliverable: string) {
    setAssigned((prev) =>
      prev.map((a) => (a.id === id ? { ...a, deliverable } : a))
    )
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) {
      setError('Campaign name is required')
      return
    }
    if (!form.brand_id) {
      setError('Please select a brand')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()

    // Create campaign
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .insert({
        brand_id: form.brand_id,
        name: form.name.trim(),
        retailer: form.retailer.trim() || null,
        region: form.region.trim() || null,
        quarter: form.quarter || null,
        products: form.products.trim() || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        posting_deadline: form.posting_deadline || null,
        status: 'active',
      })
      .select('id')
      .single()

    if (campErr || !campaign) {
      console.error('Failed to create campaign:', campErr?.message)
      setError(campErr?.message ?? 'Failed to create campaign')
      setSaving(false)
      return
    }

    // Create campaign_influencers
    if (assigned.length > 0) {
      const ciRecords = assigned.map((a) => ({
        campaign_id: campaign.id,
        influencer_id: a.id,
        deliverable: a.deliverable || null,
        pipeline_stage: 'contacted',
        w9_status: 'pending',
        invoice_status: 'pending',
        payment_status: 'pending',
      }))

      const { error: ciErr } = await supabase
        .from('campaign_influencers')
        .insert(ciRecords)

      if (ciErr) {
        console.error('Failed to assign influencers:', ciErr.message)
        // Campaign was created, just warn
        setError('Campaign created but failed to assign some influencers: ' + ciErr.message)
        setSaving(false)
        return
      }
    }

    router.push('/campaigns')
  }

  return (
    <>
      <Topbar title="New Campaign" />

      <div className="flex-1 overflow-y-auto bg-[#fafaf9] p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {error && (
            <div className="px-4 py-3 bg-[#fef2f2] text-[#dc2626] text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {/* Campaign Details */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">
                Campaign Details
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {/* Brand Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Brand *
                </label>
                <select
                  value={form.brand_id}
                  onChange={(e) => updateField('brand_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20"
                  required
                >
                  <option value="">Select brand</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditional fields */}
              {isMissJones && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Retailer
                  </label>
                  <input
                    type="text"
                    value={form.retailer}
                    onChange={(e) => updateField('retailer', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                    placeholder="e.g., Target, Walmart"
                  />
                </div>
              )}

              {isWineAndCola && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Region
                  </label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => updateField('region', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                    placeholder="e.g., Southeast, Midwest"
                  />
                </div>
              )}

              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="e.g., Summer Launch 2026"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Quarter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quarter
                  </label>
                  <select
                    value={form.quarter}
                    onChange={(e) => updateField('quarter', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20"
                  >
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Budget */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Budget ($)
                  </label>
                  <input
                    type="number"
                    value={form.budget}
                    onChange={(e) => updateField('budget', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                    placeholder="5000"
                    min="0"
                    step="1"
                  />
                </div>
              </div>

              {/* Products */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Products
                </label>
                <input
                  type="text"
                  value={form.products}
                  onChange={(e) => updateField('products', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="Product names, separated by commas"
                />
              </div>

              {/* Posting Deadline */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Posting Deadline
                </label>
                <input
                  type="date"
                  value={form.posting_deadline}
                  onChange={(e) => updateField('posting_deadline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                />
              </div>
            </div>
          </div>

          {/* Assign Influencers */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">
                Assign Influencers
              </h2>
            </div>

            <div className="p-6">
              {/* Search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search influencers by name or handle..."
                  value={influencerSearch}
                  onChange={(e) => setInfluencerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                />
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map((inf) => (
                    <button
                      key={inf.id}
                      type="button"
                      onClick={() => addInfluencer(inf)}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">
                            {getInitials(inf.name)}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900">
                            {inf.name}
                          </p>
                          {inf.handle && (
                            <p className="text-[10px] text-gray-400 font-mono">
                              @{inf.handle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {inf.rate != null && (
                          <span className="text-[10px] text-gray-400">
                            ${inf.rate.toLocaleString()}
                          </span>
                        )}
                        <Plus size={14} className="text-[#1A6BFF]" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {influencerSearch.trim() && searchResults.length === 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  No matching influencers found
                </p>
              )}

              {/* Assigned Influencers */}
              {assigned.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Assigned ({assigned.length})
                  </p>
                  {assigned.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                        <span className="text-white text-[9px] font-bold">
                          {getInitials(a.name)}
                        </span>
                      </div>
                      <div className="min-w-0 shrink-0">
                        <p className="text-xs font-medium text-gray-900">
                          {a.name}
                        </p>
                        {a.handle && (
                          <p className="text-[10px] text-gray-400 font-mono">
                            @{a.handle}
                          </p>
                        )}
                      </div>

                      {a.rate != null && (
                        <span className="px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#059669] text-[10px] font-medium shrink-0">
                          ${a.rate.toLocaleString()}
                        </span>
                      )}

                      <input
                        type="text"
                        placeholder="Deliverable (e.g., 1 Reel + 2 Stories)"
                        value={a.deliverable}
                        onChange={(e) => updateDeliverable(a.id, e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF] bg-white"
                      />

                      <button
                        type="button"
                        onClick={() => removeInfluencer(a.id)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {assigned.length === 0 && !influencerSearch && (
                <p className="mt-4 text-xs text-gray-300 text-center py-4">
                  Search and add influencers to this campaign
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/campaigns')}
              className="px-5 py-2.5 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1A6BFF] text-white text-sm font-medium rounded-lg hover:bg-[#1558d4] disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
