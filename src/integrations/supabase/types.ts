export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      delivery_settings: {
        Row: {
          base_fee: number;
          created_at: string;
          id: boolean;
          min_fee: number;
          price_per_km: number;
          updated_at: string;
        };
        Insert: {
          base_fee?: number;
          created_at?: string;
          id?: boolean;
          min_fee?: number;
          price_per_km?: number;
          updated_at?: string;
        };
        Update: {
          base_fee?: number;
          created_at?: string;
          id?: boolean;
          min_fee?: number;
          price_per_km?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      deposits: {
        Row: {
          address: string | null;
          commune: string;
          created_at: string;
          delivery_base_fee: number | null;
          delivery_min_fee: number | null;
          delivery_price_per_km: number | null;
          id: string;
          is_active: boolean;
          latitude: number | null;
          longitude: number | null;
          manager_email: string | null;
          name: string;
          neighborhood: string | null;
          opening_hours: string | null;
          phone: string | null;
          subscription_plan: string;
          subscription_status: string;
          updated_at: string;
          valid_until: string | null;
          whatsapp: string | null;
        };
        Insert: {
          address?: string | null;
          commune: string;
          created_at?: string;
          delivery_base_fee?: number | null;
          delivery_min_fee?: number | null;
          delivery_price_per_km?: number | null;
          id?: string;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          manager_email?: string | null;
          name: string;
          neighborhood?: string | null;
          opening_hours?: string | null;
          phone?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          updated_at?: string;
          valid_until?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          commune?: string;
          created_at?: string;
          delivery_base_fee?: number | null;
          delivery_min_fee?: number | null;
          delivery_price_per_km?: number | null;
          id?: string;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          manager_email?: string | null;
          name?: string;
          neighborhood?: string | null;
          opening_hours?: string | null;
          phone?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          updated_at?: string;
          valid_until?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      drivers: {
        Row: {
          created_at: string;
          deposit_id: string | null;
          full_name: string;
          id: string;
          is_available: boolean;
          phone: string;
          updated_at: string;
          vehicle: string | null;
          zone: string | null;
        };
        Insert: {
          created_at?: string;
          deposit_id?: string | null;
          full_name: string;
          id?: string;
          is_available?: boolean;
          phone: string;
          updated_at?: string;
          vehicle?: string | null;
          zone?: string | null;
        };
        Update: {
          created_at?: string;
          deposit_id?: string | null;
          full_name?: string;
          id?: string;
          is_available?: boolean;
          phone?: string;
          updated_at?: string;
          vehicle?: string | null;
          zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_deposit_id_fkey";
            columns: ["deposit_id"];
            isOneToOne: false;
            referencedRelation: "deposits";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          issued_at: string;
          order_id: string;
          payment_status: string;
        };
        Insert: {
          id?: string;
          invoice_number: string;
          issued_at?: string;
          order_id: string;
          payment_status?: string;
        };
        Update: {
          id?: string;
          invoice_number?: string;
          issued_at?: string;
          order_id?: string;
          payment_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          order_type: string;
          product_id: string | null;
          product_label: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_type: string;
          product_id?: string | null;
          product_label: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_type?: string;
          product_id?: string | null;
          product_label?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address_details: string | null;
          cancel_reason: string | null;
          commune: string;
          created_at: string;
          credit_applied: number;
          customer_lat: number | null;
          customer_lng: number | null;
          customer_name: string;
          delivery_fee: number;
          delivery_mode: string;
          delivery_timing: string | null;
          delivery_time: string | null;
          deposit_id: string | null;
          distance_km: number | null;
          driver_id: string | null;
          id: string;
          landmark: string;
          neighborhood: string | null;
          order_number: string;
          payment_method: string;
          phone_primary: string;
          phone_whatsapp: string | null;
          referral_bonus_awarded: boolean;
          status: string;
          total_amount: number;
          tracking_token: string;
          user_id: string | null;
        };
        Insert: {
          address_details?: string | null;
          cancel_reason?: string | null;
          commune: string;
          created_at?: string;
          credit_applied?: number;
          customer_lat?: number | null;
          customer_lng?: number | null;
          customer_name: string;
          delivery_fee?: number;
          delivery_mode?: string;
          delivery_timing?: string | null;
          delivery_time?: string | null;
          deposit_id?: string | null;
          distance_km?: number | null;
          driver_id?: string | null;
          id?: string;
          landmark: string;
          neighborhood?: string | null;
          order_number: string;
          payment_method: string;
          phone_primary: string;
          phone_whatsapp?: string | null;
          referral_bonus_awarded?: boolean;
          status?: string;
          total_amount: number;
          tracking_token?: string;
          user_id?: string | null;
        };
        Update: {
          address_details?: string | null;
          cancel_reason?: string | null;
          commune?: string;
          created_at?: string;
          credit_applied?: number;
          customer_lat?: number | null;
          customer_lng?: number | null;
          customer_name?: string;
          delivery_fee?: number;
          delivery_mode?: string;
          delivery_timing?: string | null;
          delivery_time?: string | null;
          deposit_id?: string | null;
          distance_km?: number | null;
          driver_id?: string | null;
          id?: string;
          landmark?: string;
          neighborhood?: string | null;
          order_number?: string;
          payment_method?: string;
          phone_primary?: string;
          phone_whatsapp?: string | null;
          referral_bonus_awarded?: boolean;
          status?: string;
          total_amount?: number;
          tracking_token?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_deposit_id_fkey";
            columns: ["deposit_id"];
            isOneToOne: false;
            referencedRelation: "deposits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          brand: string | null;
          created_at: string;
          id: string;
          is_available: boolean;
          name: string;
          price_full: number;
          price_refill: number;
          stock_quantity: number;
          weight_kg: number;
        };
        Insert: {
          brand?: string | null;
          created_at?: string;
          id?: string;
          is_available?: boolean;
          name: string;
          price_full: number;
          price_refill: number;
          stock_quantity?: number;
          weight_kg: number;
        };
        Update: {
          brand?: string | null;
          created_at?: string;
          id?: string;
          is_available?: boolean;
          name?: string;
          price_full?: number;
          price_refill?: number;
          stock_quantity?: number;
          weight_kg?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          default_commune: string | null;
          first_order_placed: boolean;
          full_name: string | null;
          id: string;
          loyalty_credit: number;
          phone_whatsapp: string | null;
          referral_code: string | null;
          referred_by: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_commune?: string | null;
          first_order_placed?: boolean;
          full_name?: string | null;
          id: string;
          loyalty_credit?: number;
          phone_whatsapp?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_commune?: string | null;
          first_order_placed?: boolean;
          full_name?: string | null;
          id?: string;
          loyalty_credit?: number;
          phone_whatsapp?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          created_at: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          id: string;
          is_active: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          is_active?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          is_active?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_loyalty_credit: { Args: { _amount: number }; Returns: number };
      extend_deposit_subscription: {
        Args: { _days: number; _deposit_id: string };
        Returns: undefined;
      };
      find_referrer_by_code: { Args: { _code: string }; Returns: string };
      generate_referral_code: { Args: never; Returns: string };
      get_driver_for_guest: {
        Args: { p_driver_id: string; p_token: string };
        Returns: unknown;
      };
      get_order_for_guest: {
        Args: { p_order_id: string; p_token: string };
        Returns: unknown;
      };
      get_order_items_for_guest: {
        Args: { p_order_id: string; p_token: string };
        Returns: unknown;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      promote_master_admin: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;
