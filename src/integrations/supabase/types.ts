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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      casos_entrantes: {
        Row: {
          apellidos: string | null
          archivado: boolean
          aseguramiento: string | null
          cod_ref: string | null
          codigo: string | null
          created_at: string
          created_by: string | null
          detalle: string | null
          documento: string | null
          eapb: string | null
          especialidad: string | null
          estado: string | null
          fecha: string | null
          fecha_vence: string | null
          hrs_reserva: string | null
          id: string
          ips: string | null
          medico: string | null
          nombres: string | null
          regimen: string | null
          texto_ia: string | null
          tipo: string | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          apellidos?: string | null
          archivado?: boolean
          aseguramiento?: string | null
          cod_ref?: string | null
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          eapb?: string | null
          especialidad?: string | null
          estado?: string | null
          fecha?: string | null
          fecha_vence?: string | null
          hrs_reserva?: string | null
          id?: string
          ips?: string | null
          medico?: string | null
          nombres?: string | null
          regimen?: string | null
          texto_ia?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          apellidos?: string | null
          archivado?: boolean
          aseguramiento?: string | null
          cod_ref?: string | null
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          eapb?: string | null
          especialidad?: string | null
          estado?: string | null
          fecha?: string | null
          fecha_vence?: string | null
          hrs_reserva?: string | null
          id?: string
          ips?: string | null
          medico?: string | null
          nombres?: string | null
          regimen?: string | null
          texto_ia?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalogos: {
        Row: {
          activo: boolean
          created_at: string
          extra1: string | null
          extra2: string | null
          id: string
          tipo: string
          updated_at: string
          valor: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          extra1?: string | null
          extra2?: string | null
          id?: string
          tipo: string
          updated_at?: string
          valor: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          extra1?: string | null
          extra2?: string | null
          id?: string
          tipo?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          cargo: string | null
          created_at: string
          id: string
          nombre: string | null
          numero_documento: string | null
          tipo_documento: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          created_at?: string
          id?: string
          nombre?: string | null
          numero_documento?: string | null
          tipo_documento?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          created_at?: string
          id?: string
          nombre?: string | null
          numero_documento?: string | null
          tipo_documento?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      remisiones: {
        Row: {
          archivado: boolean
          asegurador: string | null
          cama: string | null
          cie10: string | null
          codigo_radicacion: string | null
          contacto_nombre: string | null
          contacto_parentesco: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          documento: string | null
          edad: string | null
          especialidades_receptoras: string | null
          especialidades_tratantes: string | null
          especificacion: string | null
          estado: string | null
          evolucion: string | null
          evolucion_detalle: string | null
          fecha_inicio: string | null
          fecha_radicado: string | null
          id: string
          ips_receptora: string | null
          observaciones: string | null
          paciente: string | null
          pqrs: string | null
          prestador_traslado: string | null
          prioridad: string | null
          regimen: string | null
          remision_por: string | null
          servicio: string | null
          soportes: string | null
          texto_ia: string | null
          tipo_ambulancia: string | null
          tipo_tramite: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          asegurador?: string | null
          cama?: string | null
          cie10?: string | null
          codigo_radicacion?: string | null
          contacto_nombre?: string | null
          contacto_parentesco?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          documento?: string | null
          edad?: string | null
          especialidades_receptoras?: string | null
          especialidades_tratantes?: string | null
          especificacion?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_detalle?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips_receptora?: string | null
          observaciones?: string | null
          paciente?: string | null
          pqrs?: string | null
          prestador_traslado?: string | null
          prioridad?: string | null
          regimen?: string | null
          remision_por?: string | null
          servicio?: string | null
          soportes?: string | null
          texto_ia?: string | null
          tipo_ambulancia?: string | null
          tipo_tramite?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          asegurador?: string | null
          cama?: string | null
          cie10?: string | null
          codigo_radicacion?: string | null
          contacto_nombre?: string | null
          contacto_parentesco?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          documento?: string | null
          edad?: string | null
          especialidades_receptoras?: string | null
          especialidades_tratantes?: string | null
          especificacion?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_detalle?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips_receptora?: string | null
          observaciones?: string | null
          paciente?: string | null
          pqrs?: string | null
          prestador_traslado?: string | null
          prioridad?: string | null
          regimen?: string | null
          remision_por?: string | null
          servicio?: string | null
          soportes?: string | null
          texto_ia?: string | null
          tipo_ambulancia?: string | null
          tipo_tramite?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seguimientos: {
        Row: {
          archivado: boolean
          caso_id: string
          created_at: string
          created_by: string | null
          detalle: string | null
          id: string
          nombre_usuario: string | null
          radicado: string | null
          tipo_caso: string
          tipo_seguimiento: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          caso_id: string
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          id?: string
          nombre_usuario?: string | null
          radicado?: string | null
          tipo_caso: string
          tipo_seguimiento?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          caso_id?: string
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          id?: string
          nombre_usuario?: string | null
          radicado?: string | null
          tipo_caso?: string
          tipo_seguimiento?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operativa" | "temporal"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operativa", "temporal"],
    },
  },
} as const
