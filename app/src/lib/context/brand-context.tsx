'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Brand {
  id: string
  name: string
  invoice_email: string | null
  invoice_instructions: string | null
}

interface BrandContextValue {
  selectedBrand: Brand | null
  brands: Brand[]
  loading: boolean
  setSelectedBrand: (brand: Brand) => void
}

const BrandContext = createContext<BrandContextValue>({
  selectedBrand: null,
  brands: [],
  loading: true,
  setSelectedBrand: () => {},
})

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBrands() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name')

      if (error) {
        console.error('Failed to fetch brands:', error.message)
        setLoading(false)
        return
      }

      const fetched: Brand[] = (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        invoice_email: b.invoice_email,
        invoice_instructions: b.invoice_instructions,
      }))

      setBrands(fetched)
      if (fetched.length > 0) {
        setSelectedBrand(fetched[0])
      }
      setLoading(false)
    }

    fetchBrands()
  }, [])

  return (
    <BrandContext.Provider
      value={{ selectedBrand, brands, loading, setSelectedBrand }}
    >
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  const context = useContext(BrandContext)
  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider')
  }
  return context
}
