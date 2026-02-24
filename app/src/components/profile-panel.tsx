'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  X, Mail, MapPin, Globe, Star, DollarSign, Megaphone, UserPlus, Pencil,
  ChevronRight, Check, FileText, Receipt, CreditCard, Save, XCircle,
  Instagram, AtSign, Users, Hash
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'
import type { Tables } from '@/lib/types/database'

interface CampaignHistory {
  id: string
  campaign_id: string
  campaign_name: string
  pipeline_stage: string
  deliverable: string | null
  w9_status: string
  invoice_status: string
  payment_status: string
  created_at: string
  updated_at: string
}

interface ProfilePanelProps {
  influencerId: string | null
  onClose: () => void
  onUpdate?: () => void
}

const PIPELINE_STAGES = [
  { key: 'contacted', label: 'Contacted', color: '#94a3b8' },
  { key: 'brief_sent', label: 'Brief Sent', color: '#60a5fa' },
  { key: 'content_received', label: 'Content Received', color: '#fbbf24' },
  { key: 'w9_done', label: 'W9 Done', color: '#a78bfa' },
  { key: 'invoice_received', label: 'Invoice Received', color: '#fb923c' },
  { key: 'paid', label: 'Paid', color: '#34d399' },
  { key: 'posted', label: 'Posted', color: '#FF0080' },
] as const

const STAGE_COLORS: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.color])
)

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

export default function ProfilePanel({ influencerId, onClose, onUpdate }: ProfilePanelProps) {
  const { selectedBrand } = useBrand()
  const [influencer, setInfluencer] = useState<Tables<'influencers'> | null>(null)
  const [history, setHistory] = useState<CampaignHistory[]>([])
  const [stats, setStats] = useState({ campaigns: 0, avgRating: 0, totalEarned: 0 })
  const [currentCampaign, setCurrentCampaign] = useState<CampaignHistory | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    handle: '',
    email: '',
    platform: '',
    location: '',
    rate: '',
    follower_count: '',
    content_type: '',
  })

  // Add to campaign state
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [availableCampaigns, setAvailableCampaigns] = useState<{ id: string; name: string }[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [newDeliverable, setNewDeliverable] = useState('')

  const fetchProfile = useCallback(async () => {
    if (!influencerId) return
    setLoading(true)
    const supabase = createClient()

    const { data: inf, error: infErr } = await supabase
      .from('influencers')
      .select('*')
      .eq('id', influencerId)
      .single()

    if (infErr || !inf) {
      console.error('Failed to fetch influencer:', infErr?.message)
      setLoading(false)
      return
    }

    setInfluencer(inf)
    setNotes(inf.notes ?? '')
    setEditForm({
      name: inf.name,
      handle: inf.handle ?? '',
      email: inf.email ?? '',
      platform: inf.platform ?? '',
      location: inf.location ?? '',
      rate: inf.rate?.toString() ?? '',
      follower_count: inf.follower_count?.toString() ?? '',
      content_type: inf.content_type ?? '',
    })

    const { data: ciData, error: ciErr } = await supabase
      .from('campaign_influencers')
      .select('id, campaign_id, pipeline_stage, deliverable, w9_status, invoice_status, payment_status, created_at, updated_at')
      .eq('influencer_id', influencerId)
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
      campaign_id: ci.campaign_id,
      campaign_name: campaignsMap[ci.campaign_id] ?? 'Unknown Campaign',
      pipeline_stage: ci.pipeline_stage,
      deliverable: ci.deliverable,
      w9_status: ci.w9_status,
      invoice_status: ci.invoice_status,
      payment_status: ci.payment_status,
      created_at: ci.created_at,
      updated_at: ci.updated_at,
    }))

    setHistory(historyItems)
    const active = historyItems.find((h) => h.pipeline_stage !== 'posted')
    setCurrentCampaign(active ?? historyItems[0] ?? null)

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
  }, [influencerId])

  useEffect(() => {
    if (!influencerId) return
    setEditMode(false)
    setShowAddCampaign(false)
    fetchProfile()
  }, [influencerId, fetchProfile])

  // Save notes on blur
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

  // Save profile edits
  const handleSaveProfile = async () => {
    if (!influencerId) return
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('influencers')
      .update({
        name: editForm.name,
        handle: editForm.handle || null,
        email: editForm.email || null,
        platform: editForm.platform || null,
        location: editForm.location || null,
        rate: editForm.rate ? parseFloat(editForm.rate) : null,
        follower_count: editForm.follower_count ? parseInt(editForm.follower_count) : null,
        content_type: editForm.content_type || null,
      })
      .eq('id', influencerId)

    if (error) {
      console.error('Failed to update profile:', error.message)
    } else {
      setEditMode(false)
      await fetchProfile()
      onUpdate?.()
    }
    setSaving(false)
  }

  // Update pipeline stage
  const handleStageChange = async (ciId: string, newStage: string) => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('campaign_influencers')
      .update({ pipeline_stage: newStage })
      .eq('id', ciId)

    if (error) {
      console.error('Failed to update stage:', error.message)
    } else {
      await fetchProfile()
      onUpdate?.()
    }
    setSaving(false)
  }

  // Update W9/Invoice/Payment status
  const handleStatusChange = async (ciId: string, field: 'w9_status' | 'invoice_status' | 'payment_status', newValue: string) => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('campaign_influencers')
      .update({ [field]: newValue })
      .eq('id', ciId)

    if (error) {
      console.error(`Failed to update ${field}:`, error.message)
    } else {
      await fetchProfile()
      onUpdate?.()
    }
    setSaving(false)
  }

  // Add to campaign
  const handleShowAddCampaign = async () => {
    setShowAddCampaign(true)
    const supabase = createClient()
    let query = supabase.from('campaigns').select('id, name').eq('status', 'active').order('created_at', { ascending: false })
    if (selectedBrand?.id) {
      query = query.eq('brand_id', selectedBrand.id)
    }
    const { data } = await query
    setAvailableCampaigns(data ?? [])
  }

  const handleAddToCampaign = async () => {
    if (!influencerId || !selectedCampaignId) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('campaign_influencers').insert({
      campaign_id: selectedCampaignId,
      influencer_id: influencerId,
      deliverable: newDeliverable || null,
    })

    if (error) {
      console.error('Failed to add to campaign:', error.message)
    } else {
      setShowAddCampaign(false)
      setSelectedCampaignId('')
      setNewDeliverable('')
      await fetchProfile()
      onUpdate?.()
    }
    setSaving(false)
  }

  if (!influencerId) return null

  const currentStageIndex = currentCampaign
    ? PIPELINE_STAGES.findIndex((s) => s.key === currentCampaign.pipeline_stage)
    : -1

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[440px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in">
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

            {/* Contact Info — View or Edit */}
            <div className="px-6 pb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Contact Info
                </h3>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="text-[10px] text-[#1A6BFF] hover:text-[#1558d4] font-medium flex items-center gap-1"
                  >
                    <Pencil size={10} />
                    Edit
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Name</label>
                    <input
                      className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Handle</label>
                      <input
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        value={editForm.handle}
                        onChange={(e) => setEditForm({ ...editForm, handle: e.target.value })}
                        placeholder="@handle"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Platform</label>
                      <select
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        value={editForm.platform}
                        onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                      >
                        <option value="">Select...</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="twitter">Twitter</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Email</label>
                    <input
                      className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Location</label>
                      <input
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Content Type</label>
                      <input
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        value={editForm.content_type}
                        onChange={(e) => setEditForm({ ...editForm, content_type: e.target.value })}
                        placeholder="e.g. UGC, Reel"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Rate ($)</label>
                      <input
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        type="number"
                        value={editForm.rate}
                        onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-medium block mb-0.5">Followers</label>
                      <input
                        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                        type="number"
                        value={editForm.follower_count}
                        onChange={(e) => setEditForm({ ...editForm, follower_count: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1A6BFF] text-white text-xs font-medium rounded-md hover:bg-[#1558d4] transition-colors disabled:opacity-50"
                    >
                      <Save size={12} />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
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
                  {influencer?.content_type && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Hash size={14} className="text-gray-400 shrink-0" />
                      <span>{influencer.content_type}</span>
                    </div>
                  )}
                  {influencer?.rate && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <DollarSign size={14} className="text-gray-400 shrink-0" />
                      <span>${influencer.rate.toLocaleString()}</span>
                    </div>
                  )}
                  {influencer?.follower_count && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Users size={14} className="text-gray-400 shrink-0" />
                      <span>{influencer.follower_count.toLocaleString()} followers</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Workflow Actions — Current Campaign */}
            {currentCampaign && (
              <div className="px-6 pb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Workflow — {currentCampaign.campaign_name}
                </h3>

                {/* Pipeline Stage Stepper */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-1 mb-2">
                    {PIPELINE_STAGES.map((stage, i) => {
                      const isCurrent = stage.key === currentCampaign.pipeline_stage
                      const isPast = i < currentStageIndex
                      return (
                        <button
                          key={stage.key}
                          onClick={() => handleStageChange(currentCampaign.id, stage.key)}
                          disabled={saving}
                          className={`flex-1 h-2 rounded-full transition-all ${
                            isCurrent
                              ? 'ring-2 ring-offset-1'
                              : isPast
                              ? 'opacity-100'
                              : 'opacity-30'
                          } disabled:cursor-wait`}
                          style={{
                            backgroundColor: stage.color,
                            ...(isCurrent ? { ringColor: stage.color } : {}),
                          }}
                          title={stage.label}
                        />
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: STAGE_COLORS[currentCampaign.pipeline_stage] ?? '#94a3b8' }}
                    >
                      {formatStageName(currentCampaign.pipeline_stage)}
                    </span>
                    {currentStageIndex < PIPELINE_STAGES.length - 1 && (
                      <button
                        onClick={() => handleStageChange(currentCampaign.id, PIPELINE_STAGES[currentStageIndex + 1].key)}
                        disabled={saving}
                        className="flex items-center gap-1 text-[11px] text-[#1A6BFF] hover:text-[#1558d4] font-medium disabled:opacity-50"
                      >
                        Advance to {PIPELINE_STAGES[currentStageIndex + 1].label}
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Dropdowns */}
                <div className="space-y-2">
                  <StatusDropdown
                    icon={<FileText size={14} />}
                    label="W9 Status"
                    value={currentCampaign.w9_status}
                    options={['not_required', 'pending', 'sent', 'received', 'complete']}
                    onChange={(val) => handleStatusChange(currentCampaign.id, 'w9_status', val)}
                    disabled={saving}
                  />
                  <StatusDropdown
                    icon={<Receipt size={14} />}
                    label="Invoice Status"
                    value={currentCampaign.invoice_status}
                    options={['pending', 'sent', 'received', 'paid']}
                    onChange={(val) => handleStatusChange(currentCampaign.id, 'invoice_status', val)}
                    disabled={saving}
                  />
                  <StatusDropdown
                    icon={<CreditCard size={14} />}
                    label="Payment Status"
                    value={currentCampaign.payment_status}
                    options={['unpaid', 'processing', 'paid']}
                    onChange={(val) => handleStatusChange(currentCampaign.id, 'payment_status', val)}
                    disabled={saving}
                  />
                </div>

                {/* Deliverable */}
                {currentCampaign.deliverable && (
                  <div className="mt-3 text-xs text-gray-500">
                    Deliverable: <span className="text-gray-700 font-medium">{currentCampaign.deliverable}</span>
                  </div>
                )}
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
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Campaign</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Stage</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-t border-gray-50">
                          <td className="px-3 py-2 text-gray-700">{h.campaign_name}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ backgroundColor: STAGE_COLORS[h.pipeline_stage] ?? '#94a3b8' }}
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
            <div className="px-6 pb-6">
              {showAddCampaign ? (
                <div className="border border-gray-200 rounded-lg p-3 space-y-2.5">
                  <h4 className="text-xs font-semibold text-gray-700">Add to Campaign</h4>
                  <select
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                  >
                    <option value="">Select campaign...</option>
                    {availableCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]/20 focus:border-[#1A6BFF]"
                    placeholder="Deliverable (e.g. 1 Reel + 2 Stories)"
                    value={newDeliverable}
                    onChange={(e) => setNewDeliverable(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddToCampaign}
                      disabled={saving || !selectedCampaignId}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1A6BFF] text-white text-xs font-medium rounded-md hover:bg-[#1558d4] transition-colors disabled:opacity-50"
                    >
                      <Check size={12} />
                      {saving ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      onClick={() => setShowAddCampaign(false)}
                      className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleShowAddCampaign}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#1A6BFF] text-white text-xs font-medium rounded-lg hover:bg-[#1558d4] transition-colors"
                >
                  <UserPlus size={14} />
                  Add to Campaign
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  )
}

// Color map for all status values
const STATUS_COLORS: Record<string, string> = {
  not_required: '#94a3b8',
  pending: '#f59e0b',
  sent: '#3b82f6',
  received: '#34d399',
  complete: '#059669',
  paid: '#34d399',
  unpaid: '#94a3b8',
  processing: '#f59e0b',
}

// Status dropdown component
function StatusDropdown({
  icon,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  value: string
  options: string[]
  onChange: (newValue: string) => void
  disabled: boolean
}) {
  const color = STATUS_COLORS[value] ?? '#94a3b8'
  const displayValue = value.replace(/_/g, ' ')

  return (
    <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none pl-2.5 pr-6 py-0.5 rounded-full text-[10px] font-medium text-white capitalize cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300 disabled:opacity-50 disabled:cursor-wait"
          style={{ backgroundColor: color }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt} className="text-gray-900 bg-white text-xs capitalize">
              {opt.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
          <svg className="h-3 w-3 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  )
}
