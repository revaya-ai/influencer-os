'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  X,
  Star,
  Loader2,
} from 'lucide-react'
import Topbar from '@/components/topbar'
import ProfilePanel from '@/components/profile-panel'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/lib/types/database'

type SortField = 'name' | 'handle' | 'platform' | 'content_type' | 'location' | 'rate' | 'campaign_count' | 'performance_rating'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

const PLATFORMS = ['All', 'Instagram', 'TikTok', 'YouTube', 'Twitter']
const CONTENT_TYPES = ['All', 'Photo', 'Video', 'Reel', 'Story', 'Blog']

interface InfluencerRow extends Tables<'influencers'> {
  campaign_count: number
}

export default function RolodexPage() {
  const [influencers, setInfluencers] = useState<InfluencerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [contentTypeFilter, setContentTypeFilter] = useState('All')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)

  const fetchInfluencers = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: infData, error } = await supabase
      .from('influencers')
      .select('*')
      .order('name')

    if (error) {
      console.error('Failed to fetch influencers:', error.message)
      setLoading(false)
      return
    }

    // Fetch campaign counts
    const { data: ciData } = await supabase
      .from('campaign_influencers')
      .select('influencer_id')

    const countMap: Record<string, number> = {}
    for (const ci of ciData ?? []) {
      countMap[ci.influencer_id] = (countMap[ci.influencer_id] ?? 0) + 1
    }

    const rows: InfluencerRow[] = (infData ?? []).map((inf) => ({
      ...inf,
      campaign_count: countMap[inf.id] ?? 0,
    }))

    setInfluencers(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInfluencers()
  }, [fetchInfluencers])

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...influencers]

    // Search
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(lower) ||
          (i.handle && i.handle.toLowerCase().includes(lower))
      )
    }

    // Platform filter
    if (platformFilter !== 'All') {
      result = result.filter(
        (i) => i.platform?.toLowerCase() === platformFilter.toLowerCase()
      )
    }

    // Content type filter
    if (contentTypeFilter !== 'All') {
      result = result.filter(
        (i) => i.content_type?.toLowerCase() === contentTypeFilter.toLowerCase()
      )
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'handle':
          aVal = (a.handle ?? '').toLowerCase()
          bVal = (b.handle ?? '').toLowerCase()
          break
        case 'platform':
          aVal = (a.platform ?? '').toLowerCase()
          bVal = (b.platform ?? '').toLowerCase()
          break
        case 'content_type':
          aVal = (a.content_type ?? '').toLowerCase()
          bVal = (b.content_type ?? '').toLowerCase()
          break
        case 'location':
          aVal = (a.location ?? '').toLowerCase()
          bVal = (b.location ?? '').toLowerCase()
          break
        case 'rate':
          aVal = a.rate ?? 0
          bVal = b.rate ?? 0
          break
        case 'campaign_count':
          aVal = a.campaign_count
          bVal = b.campaign_count
          break
        case 'performance_rating':
          aVal = a.performance_rating ?? 0
          bVal = b.performance_rating ?? 0
          break
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [influencers, search, platformFilter, contentTypeFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE, filtered.length)

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, platformFilter, contentTypeFilter])

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const columns: { key: SortField; label: string; width?: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'handle', label: 'Handle' },
    { key: 'platform', label: 'Platform', width: 'w-24' },
    { key: 'content_type', label: 'Content Type', width: 'w-28' },
    { key: 'location', label: 'Location', width: 'w-28' },
    { key: 'rate', label: 'Rate', width: 'w-24' },
    { key: 'campaign_count', label: 'Campaigns', width: 'w-24' },
    { key: 'performance_rating', label: 'Rating', width: 'w-20' },
  ]

  return (
    <>
      <Topbar title="Influencer Rolodex">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#1A6BFF] text-white text-xs font-medium rounded-lg hover:bg-[#1558d4] transition-colors"
        >
          <Plus size={14} />
          Add Influencer
        </button>
      </Topbar>

      <div className="flex-1 overflow-hidden bg-[#fafaf9] flex flex-col">
        {/* Search & Filters */}
        <div className="px-6 py-4 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by name or handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
            />
          </div>

          {/* Platform Filter */}
          <div className="relative">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p === 'All' ? 'All Platforms' : p}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>

          {/* Content Type Filter */}
          <div className="relative">
            <select
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20"
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {ct === 'All' ? 'All Content Types' : ct}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 px-6 pb-4 overflow-auto">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none ${col.width ?? ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown
                          size={10}
                          className={
                            sortField === col.key
                              ? 'text-[#1A6BFF]'
                              : 'text-gray-300'
                          }
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm text-gray-400">Loading influencers...</p>
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm text-gray-400">No influencers found</p>
                    </td>
                  </tr>
                ) : (
                  paged.map((inf) => (
                    <tr
                      key={inf.id}
                      className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedInfluencerId(inf.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF0080] to-[#1A6BFF] flex items-center justify-center shrink-0">
                            <span className="text-white text-[9px] font-bold">
                              {getInitials(inf.name)}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-gray-900">
                            {inf.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {inf.handle ? `@${inf.handle}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                        {inf.platform ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                        {inf.content_type ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {inf.location ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-900 font-medium">
                        {inf.rate != null ? `$${inf.rate.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-center">
                        {inf.campaign_count}
                      </td>
                      <td className="px-4 py-3">
                        {inf.performance_rating != null && inf.performance_rating > 0 ? (
                          <div className="flex items-center gap-1">
                            <Star
                              size={11}
                              className="text-[#f59e0b]"
                              fill="#f59e0b"
                            />
                            <span className="text-xs text-gray-700">
                              {inf.performance_rating.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Showing {showingFrom}-{showingTo} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={12} />
                  Prev
                </button>
                <span className="text-xs text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Influencer Modal */}
      {showAddModal && (
        <AddInfluencerModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            fetchInfluencers()
          }}
        />
      )}

      <ProfilePanel
        influencerId={selectedInfluencerId}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </>
  )
}

// Add Influencer Modal
function AddInfluencerModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    handle: '',
    email: '',
    platform: 'instagram',
    content_type: '',
    location: '',
    rate: '',
    follower_count: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: insertErr } = await supabase.from('influencers').insert({
      name: form.name.trim(),
      handle: form.handle.trim() || null,
      email: form.email.trim() || null,
      platform: form.platform || null,
      content_type: form.content_type.trim() || null,
      location: form.location.trim() || null,
      rate: form.rate ? parseFloat(form.rate) : null,
      follower_count: form.follower_count ? parseInt(form.follower_count, 10) : null,
    })

    if (insertErr) {
      console.error('Failed to add influencer:', insertErr.message)
      setError(insertErr.message)
      setSaving(false)
      return
    }

    onAdded()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Add Influencer</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-400"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="px-3 py-2 bg-[#fef2f2] text-[#dc2626] text-xs rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                placeholder="Full name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Handle
                </label>
                <input
                  type="text"
                  value={form.handle}
                  onChange={(e) => updateField('handle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="@handle"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Platform
                </label>
                <select
                  value={form.platform}
                  onChange={(e) => updateField('platform', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20"
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">Twitter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Content Type
                </label>
                <input
                  type="text"
                  value={form.content_type}
                  onChange={(e) => updateField('content_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="Photo, Video, Reel..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="City, State"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Rate ($)
                </label>
                <input
                  type="number"
                  value={form.rate}
                  onChange={(e) => updateField('rate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                  placeholder="500"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Follower Count
              </label>
              <input
                type="number"
                value={form.follower_count}
                onChange={(e) => updateField('follower_count', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                placeholder="10000"
                min="0"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A6BFF] text-white text-sm font-medium rounded-lg hover:bg-[#1558d4] disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Adding...' : 'Add Influencer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
