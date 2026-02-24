'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Kanban,
  PlusCircle,
  Users,
  DollarSign,
  AlertTriangle,
  BarChart3,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBrand } from '@/lib/context/brand-context'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'CAMPAIGNS',
    items: [
      { label: 'Campaign Board', href: '/campaigns', icon: Kanban },
      { label: 'New Campaign', href: '/campaigns/new', icon: PlusCircle },
    ],
  },
  {
    title: 'INFLUENCERS',
    items: [
      { label: 'Rolodex', href: '/rolodex', icon: Users },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Payment Queue', href: '/payments', icon: DollarSign },
      { label: 'Chase List', href: '/chase', icon: AlertTriangle },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { selectedBrand, brands, setSelectedBrand } = useBrand()
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside
      className="flex flex-col bg-dark-2 text-white shrink-0"
      style={{ width: 228 }}
    >
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-pink rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">IO</span>
          </div>
          <div>
            <div className="text-base font-bold leading-tight">InfluencerOS</div>
            <div className="text-xs text-[#9a9a94] leading-tight">
              Campaign Management
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-5 mt-2">
        {navSections.map((section) => (
          <div key={section.title}>
            <div
              className="px-2 mb-1.5 text-[#6b6b65] font-medium uppercase tracking-wider"
              style={{ fontSize: 12 }}
            >
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors ${
                      active
                        ? 'bg-[rgba(255,0,128,0.12)] text-white border-l-[3px] border-pink'
                        : 'text-[#9a9a94] hover:bg-[rgba(255,255,255,0.05)] border-l-[3px] border-transparent'
                    }`}
                    style={{ fontSize: 14, fontWeight: 500 }}
                  >
                    <Icon size={16} className={active ? 'text-white' : 'text-[#9a9a94]'} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 mt-auto space-y-2">
        {/* Brand selector */}
        <div className="relative">
          <div
            className="px-2 mb-1.5 text-[#6b6b65] font-medium uppercase tracking-wider"
            style={{ fontSize: 13 }}
          >
            Active Brand
          </div>
          <button
            onClick={() => setBrandDropdownOpen(!brandDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-md bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.1)] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 bg-pink rounded flex items-center justify-center shrink-0">
                <span className="text-white text-[11px] font-bold">
                  {selectedBrand?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '?'}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {selectedBrand?.name ?? 'No brand'}
                </div>
              </div>
            </div>
            <ChevronDown
              size={12}
              className={`shrink-0 text-[#6b6b65] transition-transform ${brandDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {brandDropdownOpen && brands.length > 1 && (
            <div className="absolute bottom-full left-0 w-full mb-1 bg-[#2D2D2D] rounded-md border border-[rgba(255,255,255,0.1)] overflow-hidden shadow-lg">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => {
                    setSelectedBrand(brand)
                    setBrandDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    brand.id === selectedBrand?.id
                      ? 'text-white bg-[rgba(255,0,128,0.12)]'
                      : 'text-[#9a9a94] hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  <div className="w-5 h-5 bg-pink/20 rounded flex items-center justify-center shrink-0">
                    <span className="text-pink text-[11px] font-bold">
                      {brand.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  {brand.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 py-1.5 text-sm text-[#6b6b65] hover:text-[#9a9a94] transition-colors w-full"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
