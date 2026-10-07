export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      branches: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount_cents: number
          branch_id: string
          business_id: string
          cash_session_id: string
          created_at: string
          created_by: string
          id: string
          reason: string
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Insert: {
          amount_cents: number
          branch_id: string
          business_id: string
          cash_session_id: string
          created_at?: string
          created_by: string
          id?: string
          reason: string
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Update: {
          amount_cents?: number
          branch_id?: string
          business_id?: string
          cash_session_id?: string
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          type?: Database["public"]["Enums"]["cash_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_business_id_branch_id_fkey"
            columns: ["cash_session_id", "business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id", "business_id", "branch_id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          branch_id: string
          business_id: string
          cash_sales_cents: number | null
          closed_at: string | null
          closed_by: string | null
          counted_cash_cents: number | null
          credit_sales_cents: number | null
          debit_sales_cents: number | null
          difference_cents: number | null
          expected_cash_cents: number | null
          id: string
          inbound_cents: number | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash_cents: number
          other_sales_cents: number | null
          outbound_cents: number | null
          status: Database["public"]["Enums"]["cash_session_status"]
          transfer_sales_cents: number | null
        }
        Insert: {
          branch_id: string
          business_id: string
          cash_sales_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cash_cents?: number | null
          credit_sales_cents?: number | null
          debit_sales_cents?: number | null
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          inbound_cents?: number | null
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash_cents: number
          other_sales_cents?: number | null
          outbound_cents?: number | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          transfer_sales_cents?: number | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          cash_sales_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cash_cents?: number | null
          credit_sales_cents?: number | null
          debit_sales_cents?: number | null
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          inbound_cents?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash_cents?: number
          other_sales_cents?: number | null
          outbound_cents?: number | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          transfer_sales_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_branch_id_business_id_fkey"
            columns: ["branch_id", "business_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "cash_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          minimum_quantity: number | null
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          minimum_quantity?: number | null
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          minimum_quantity?: number | null
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_branch_id_business_id_fkey"
            columns: ["branch_id", "business_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "inventory_balances_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          id: string
          note: string | null
          purchase_id: string | null
          quantity_delta: number
          resulting_quantity: number
          sale_id: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          purchase_id?: string | null
          quantity_delta: number
          resulting_quantity: number
          sale_id?: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          purchase_id?: string | null
          quantity_delta?: number
          resulting_quantity?: number
          sale_id?: string | null
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_business_id_fkey"
            columns: ["branch_id", "business_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          business_id: string
          code: string
          created_at: string
          id: string
          is_primary: boolean
          variant_id: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          id?: string
          is_primary?: boolean
          variant_id: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          product_id: string
          sku: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          sku?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          business_id: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          brand_id?: string | null
          business_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          brand_id?: string | null
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_business_id_fkey"
            columns: ["brand_id", "business_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_business_id_fkey"
            columns: ["category_id", "business_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          purchase_id: string
          quantity: number
          unit_cost_cents: number
          variant_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          purchase_id: string
          quantity: number
          unit_cost_cents: number
          variant_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          purchase_id?: string
          quantity?: number
          unit_cost_cents?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_business_id_fkey"
            columns: ["purchase_id", "business_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      purchases: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          document_number: string | null
          id: string
          notes: string | null
          purchase_date: string
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          document_number?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          document_number?: string | null
          id?: string
          notes?: string | null
          purchase_date?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_id_business_id_fkey"
            columns: ["branch_id", "business_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "purchases_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_business_id_fkey"
            columns: ["supplier_id", "business_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      sale_items: {
        Row: {
          business_id: string
          created_at: string
          id: string
          line_total_cents: number
          quantity: number
          sale_id: string
          unit_price_cents: number
          variant_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          line_total_cents: number
          quantity: number
          sale_id: string
          unit_price_cents: number
          variant_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          line_total_cents?: number
          quantity?: number
          sale_id?: string
          unit_price_cents?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_business_id_fkey"
            columns: ["sale_id", "business_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          business_id: string
          cash_session_id: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          payment_method: Database["public"]["Enums"]["sale_payment_method"]
          sale_number: number
          status: Database["public"]["Enums"]["sale_status"]
          total_cents: number
        }
        Insert: {
          branch_id: string
          business_id: string
          cash_session_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          payment_method: Database["public"]["Enums"]["sale_payment_method"]
          sale_number?: number
          status?: Database["public"]["Enums"]["sale_status"]
          total_cents: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          payment_method?: Database["public"]["Enums"]["sale_payment_method"]
          sale_number?: number
          status?: Database["public"]["Enums"]["sale_status"]
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_business_id_fkey"
            columns: ["branch_id", "business_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cash_session_ownership_fkey"
            columns: ["cash_session_id", "business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id", "business_id", "branch_id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          business_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_cost_history: {
        Row: {
          amount_cents: number | null
          business_id: string
          changed_at: string
          changed_by: string | null
          id: string
          variant_id: string
        }
        Insert: {
          amount_cents?: number | null
          business_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          variant_id: string
        }
        Update: {
          amount_cents?: number | null
          business_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_cost_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_cost_history_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      variant_costs: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_costs_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      variant_offers: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          promotional_price_cents: number
          starts_at: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          promotional_price_cents: number
          starts_at?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          promotional_price_cents?: number
          starts_at?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_offers_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      variant_price_history: {
        Row: {
          amount_cents: number | null
          business_id: string
          changed_at: string
          changed_by: string | null
          id: string
          variant_id: string
        }
        Insert: {
          amount_cents?: number | null
          business_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          variant_id: string
        }
        Update: {
          amount_cents?: number | null
          business_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_price_history_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      variant_prices: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_prices_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Views: {
      variant_effective_prices: {
        Row: {
          base_price_cents: number | null
          business_id: string | null
          effective_price_cents: number | null
          offer_active: boolean | null
          offer_ends_at: string | null
          offer_id: string | null
          offer_starts_at: string | null
          promotional_price_cents: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variant_prices_variant_id_business_id_fkey"
            columns: ["variant_id", "business_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Functions: {
      adjust_variant_prices: {
        Args: {
          adjustment_percent: number
          target_business_id: string
          target_variant_ids: string[]
        }
        Returns: {
          amount_cents: number
          variant_id: string
        }[]
      }
      close_cash_session: {
        Args: {
          counted_cash_cents: number
          target_business_id: string
          target_cash_session_id: string
        }
        Returns: {
          cash_sales_cents: number
          cash_session_id: string
          closed_at: string
          credit_sales_cents: number
          debit_sales_cents: number
          difference_cents: number
          expected_cash_cents: number
          inbound_cents: number
          other_sales_cents: number
          outbound_cents: number
          transfer_sales_cents: number
        }[]
      }
      confirm_purchase: {
        Args: { target_business_id: string; target_purchase_id: string }
        Returns: {
          confirmed_at: string
          item_count: number
          purchase_id: string
          total_cents: number
        }[]
      }
      confirm_sale: {
        Args: {
          request_id: string
          requested_items: Json
          sale_payment_method: Database["public"]["Enums"]["sale_payment_method"]
          target_branch_id: string
          target_business_id: string
        }
        Returns: {
          created_at: string
          sale_id: string
          sale_number: number
          total_cents: number
        }[]
      }
      has_active_business_membership: {
        Args: { target_business_id: string }
        Returns: boolean
      }
      has_active_business_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["business_role"][]
          target_business_id: string
        }
        Returns: boolean
      }
      import_catalog_rows: {
        Args: {
          import_rows?: Json
          target_branch_id?: string
          target_business_id: string
          update_existing?: boolean
        }
        Returns: {
          detail: string
          outcome: string
          product_id: string
          source_row_number: number
          variant_id: string
        }[]
      }
      import_catalog_rows_v2: {
        Args: {
          import_rows?: Json
          target_branch_id?: string
          target_business_id: string
          update_existing?: boolean
        }
        Returns: {
          detail: string
          outcome: string
          product_id: string
          source_row_number: number
          variant_id: string
        }[]
      }
      list_cash_sessions: {
        Args: { target_branch_id?: string; target_business_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          cash_sales_cents: number
          closed_at: string
          closed_by: string
          closed_by_name: string
          counted_cash_cents: number
          credit_sales_cents: number
          debit_sales_cents: number
          difference_cents: number
          expected_cash_cents: number
          id: string
          inbound_cents: number
          notes: string
          opened_at: string
          opened_by: string
          opened_by_name: string
          opening_cash_cents: number
          other_sales_cents: number
          outbound_cents: number
          status: Database["public"]["Enums"]["cash_session_status"]
          transfer_sales_cents: number
        }[]
      }
      list_inventory_movements: {
        Args: {
          target_branch_id: string
          target_business_id: string
          target_variant_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          note: string
          quantity_delta: number
          resulting_quantity: number
          type: Database["public"]["Enums"]["inventory_movement_type"]
        }[]
      }
      list_sale_items: {
        Args: { target_business_id: string; target_sale_id: string }
        Returns: {
          id: string
          line_total_cents: number
          product_name: string
          quantity: number
          unit_price_cents: number
          variant_id: string
          variant_name: string
        }[]
      }
      list_sales: {
        Args: { target_branch_id?: string; target_business_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          payment_method: Database["public"]["Enums"]["sale_payment_method"]
          sale_number: number
          status: Database["public"]["Enums"]["sale_status"]
          total_cents: number
        }[]
      }
      open_cash_session: {
        Args: {
          opening_cash_cents: number
          session_notes?: string
          target_branch_id: string
          target_business_id: string
        }
        Returns: {
          cash_session_id: string
          opened_at: string
        }[]
      }
      record_cash_movement: {
        Args: {
          amount_cents: number
          movement_reason: string
          movement_type: Database["public"]["Enums"]["cash_movement_type"]
          target_business_id: string
          target_cash_session_id: string
        }
        Returns: {
          created_at: string
          movement_id: string
        }[]
      }
      record_inventory_movement: {
        Args: {
          movement_note?: string
          movement_quantity: number
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          target_branch_id: string
          target_business_id: string
          target_variant_id: string
        }
        Returns: {
          movement_id: string
          quantity_delta: number
          resulting_quantity: number
        }[]
      }
      set_inventory_minimum: {
        Args: {
          target_branch_id: string
          target_business_id: string
          target_minimum_quantity?: number
          target_variant_id: string
        }
        Returns: {
          minimum_quantity: number
          quantity: number
        }[]
      }
    }
    Enums: {
      business_role: "owner" | "admin" | "staff"
      cash_movement_type: "inbound" | "outbound"
      cash_session_status: "open" | "closed"
      inventory_movement_type:
        | "initial"
        | "inbound"
        | "outbound"
        | "adjustment"
        | "purchase"
        | "sale"
      purchase_status: "draft" | "confirmed" | "cancelled"
      sale_payment_method: "cash" | "debit" | "credit" | "transfer" | "other"
      sale_status: "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      business_role: ["owner", "admin", "staff"],
      cash_movement_type: ["inbound", "outbound"],
      cash_session_status: ["open", "closed"],
      inventory_movement_type: [
        "initial",
        "inbound",
        "outbound",
        "adjustment",
        "purchase",
        "sale",
      ],
      purchase_status: ["draft", "confirmed", "cancelled"],
      sale_payment_method: ["cash", "debit", "credit", "transfer", "other"],
      sale_status: ["completed"],
    },
  },
} as const
