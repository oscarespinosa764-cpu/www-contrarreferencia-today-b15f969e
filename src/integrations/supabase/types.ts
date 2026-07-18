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
      alertas_coordinacion: {
        Row: {
          caso_codigo: string | null
          caso_documento: string | null
          cerrado_at: string | null
          cerrado_por: string | null
          cerrado_por_nombre: string | null
          codigo: string
          created_at: string
          created_by: string | null
          descripcion: string | null
          detalles: Json | null
          estado: string
          evento_at: string
          gestionado_at: string | null
          gestionado_por: string | null
          gestionado_por_nombre: string | null
          hallazgo: string | null
          id: string
          idempotency_key: string
          justificacion: string | null
          mensaje: string | null
          modulo: string | null
          nombre: string | null
          prioridad: string
          revisado_at: string | null
          revisado_por: string | null
          revisado_por_nombre: string | null
          subventana: string
          updated_at: string
        }
        Insert: {
          caso_codigo?: string | null
          caso_documento?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          cerrado_por_nombre?: string | null
          codigo: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          detalles?: Json | null
          estado?: string
          evento_at?: string
          gestionado_at?: string | null
          gestionado_por?: string | null
          gestionado_por_nombre?: string | null
          hallazgo?: string | null
          id?: string
          idempotency_key: string
          justificacion?: string | null
          mensaje?: string | null
          modulo?: string | null
          nombre?: string | null
          prioridad?: string
          revisado_at?: string | null
          revisado_por?: string | null
          revisado_por_nombre?: string | null
          subventana?: string
          updated_at?: string
        }
        Update: {
          caso_codigo?: string | null
          caso_documento?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          cerrado_por_nombre?: string | null
          codigo?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          detalles?: Json | null
          estado?: string
          evento_at?: string
          gestionado_at?: string | null
          gestionado_por?: string | null
          gestionado_por_nombre?: string | null
          hallazgo?: string | null
          id?: string
          idempotency_key?: string
          justificacion?: string | null
          mensaje?: string | null
          modulo?: string | null
          nombre?: string | null
          prioridad?: string
          revisado_at?: string | null
          revisado_por?: string | null
          revisado_por_nombre?: string | null
          subventana?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          accion: string
          actor_email: string | null
          created_at: string
          detalles: Json | null
          id: string
          ip: string | null
          modulo: string | null
          registro_id: string | null
          resultado: string
          tabla: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accion: string
          actor_email?: string | null
          created_at?: string
          detalles?: Json | null
          id?: string
          ip?: string | null
          modulo?: string | null
          registro_id?: string | null
          resultado?: string
          tabla?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accion?: string
          actor_email?: string | null
          created_at?: string
          detalles?: Json | null
          id?: string
          ip?: string | null
          modulo?: string | null
          registro_id?: string | null
          resultado?: string
          tabla?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      avisos: {
        Row: {
          archivado: boolean
          created_at: string
          created_by: string | null
          estado: string | null
          fecha_final: string | null
          fecha_inicio: string | null
          id: string
          mensaje: string | null
          modulo: string | null
          prioridad: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          created_at?: string
          created_by?: string | null
          estado?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          id?: string
          mensaje?: string | null
          modulo?: string | null
          prioridad?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          created_at?: string
          created_by?: string | null
          estado?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          id?: string
          mensaje?: string | null
          modulo?: string | null
          prioridad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
          eapb_contratada_snapshot: boolean | null
          eapb_snapshot_at: string | null
          especialidad: string | null
          estado: string | null
          fecha: string | null
          fecha_vence: string | null
          hrs_reserva: string | null
          id: string
          ips: string | null
          medico: string | null
          metadata: Json | null
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
          eapb_contratada_snapshot?: boolean | null
          eapb_snapshot_at?: string | null
          especialidad?: string | null
          estado?: string | null
          fecha?: string | null
          fecha_vence?: string | null
          hrs_reserva?: string | null
          id?: string
          ips?: string | null
          medico?: string | null
          metadata?: Json | null
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
          eapb_contratada_snapshot?: boolean | null
          eapb_snapshot_at?: string | null
          especialidad?: string | null
          estado?: string | null
          fecha?: string | null
          fecha_vence?: string | null
          hrs_reserva?: string | null
          id?: string
          ips?: string | null
          medico?: string | null
          metadata?: Json | null
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
          eapb_correo_radicacion: string | null
          eapb_requisitos_radicacion: string | null
          eapb_sla_horas: number | null
          extra1: string | null
          extra2: string | null
          extra3: string | null
          id: string
          radica_oxigeno: boolean
          radica_pad: boolean
          radica_phd: boolean
          radica_unidad_especial: boolean
          seguimientos_en_plataforma: boolean
          tipo: string
          updated_at: string
          valor: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          eapb_correo_radicacion?: string | null
          eapb_requisitos_radicacion?: string | null
          eapb_sla_horas?: number | null
          extra1?: string | null
          extra2?: string | null
          extra3?: string | null
          id?: string
          radica_oxigeno?: boolean
          radica_pad?: boolean
          radica_phd?: boolean
          radica_unidad_especial?: boolean
          seguimientos_en_plataforma?: boolean
          tipo: string
          updated_at?: string
          valor: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          eapb_correo_radicacion?: string | null
          eapb_requisitos_radicacion?: string | null
          eapb_sla_horas?: number | null
          extra1?: string | null
          extra2?: string | null
          extra3?: string | null
          id?: string
          radica_oxigeno?: boolean
          radica_pad?: boolean
          radica_phd?: boolean
          radica_unidad_especial?: boolean
          seguimientos_en_plataforma?: boolean
          tipo?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      consentimientos: {
        Row: {
          aceptado: boolean
          created_at: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          aceptado?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          aceptado?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      control_mando: {
        Row: {
          accion: string | null
          created_at: string
          detalle: string | null
          fecha: string
          id: string
          modulo: string | null
          nombre_usuario: string | null
          registro_id: string | null
          rol: string | null
          sesion_id: string | null
          usuario: string | null
        }
        Insert: {
          accion?: string | null
          created_at?: string
          detalle?: string | null
          fecha?: string
          id?: string
          modulo?: string | null
          nombre_usuario?: string | null
          registro_id?: string | null
          rol?: string | null
          sesion_id?: string | null
          usuario?: string | null
        }
        Update: {
          accion?: string | null
          created_at?: string
          detalle?: string | null
          fecha?: string
          id?: string
          modulo?: string | null
          nombre_usuario?: string | null
          registro_id?: string | null
          rol?: string | null
          sesion_id?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      coordinacion: {
        Row: {
          archivado: boolean
          caso_id: string | null
          created_at: string
          created_by: string | null
          detalle: string | null
          documento: string | null
          estado: string | null
          fecha_alerta: string | null
          id: string
          paciente: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          estado?: string | null
          fecha_alerta?: string | null
          id?: string
          paciente?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          estado?: string | null
          fecha_alerta?: string | null
          id?: string
          paciente?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      domiciliarios: {
        Row: {
          ambulancia_obligatoria: boolean | null
          archivado: boolean
          cama: string | null
          cie10: string | null
          codigo_radicacion: string | null
          contacto_nombre: string | null
          contacto_parentesco: string | null
          contacto_telefono: string | null
          created_at: string
          created_by: string | null
          detalle: string | null
          documento: string | null
          eapb: string | null
          eapb_genera_codigo: boolean | null
          eapb_tiene_plataforma: boolean | null
          edad: string | null
          egreso_mismo_dia: boolean | null
          especialidades_tratantes: string | null
          estado: string | null
          estado_ciclo: string | null
          evolucion: string | null
          evolucion_actualizada_at: string | null
          evolucion_detalle: string | null
          evolucion_motivo: string | null
          fecha: string | null
          fecha_aceptacion: string | null
          fecha_cierre: string | null
          fecha_coordinacion_ambulancia: string | null
          fecha_egreso: string | null
          fecha_inicio: string | null
          fecha_prevista_egreso: string | null
          fecha_radicado: string | null
          fecha_ultima_evolucion: string | null
          id: string
          ips: string | null
          ips_receptora: string | null
          motivo_cierre: string | null
          observaciones: string | null
          paciente: string | null
          plataforma_funcionando: boolean | null
          prioridad: string | null
          proveedor: string | null
          proveedor_ambulancia: string | null
          radicacion_estado: string | null
          regimen: string | null
          requiere_ambulancia: string | null
          servicio: string | null
          tipo_ambulancia: string | null
          tipo_documento: string | null
          tipo_solicitud: string | null
          tipo_solicitud_detalle: string | null
          tipo_tramite: string | null
          trazabilidad_indigo: string | null
          unidad_especial: string | null
          updated_at: string
        }
        Insert: {
          ambulancia_obligatoria?: boolean | null
          archivado?: boolean
          cama?: string | null
          cie10?: string | null
          codigo_radicacion?: string | null
          contacto_nombre?: string | null
          contacto_parentesco?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          eapb?: string | null
          eapb_genera_codigo?: boolean | null
          eapb_tiene_plataforma?: boolean | null
          edad?: string | null
          egreso_mismo_dia?: boolean | null
          especialidades_tratantes?: string | null
          estado?: string | null
          estado_ciclo?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_aceptacion?: string | null
          fecha_cierre?: string | null
          fecha_coordinacion_ambulancia?: string | null
          fecha_egreso?: string | null
          fecha_inicio?: string | null
          fecha_prevista_egreso?: string | null
          fecha_radicado?: string | null
          fecha_ultima_evolucion?: string | null
          id?: string
          ips?: string | null
          ips_receptora?: string | null
          motivo_cierre?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          prioridad?: string | null
          proveedor?: string | null
          proveedor_ambulancia?: string | null
          radicacion_estado?: string | null
          regimen?: string | null
          requiere_ambulancia?: string | null
          servicio?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_solicitud?: string | null
          tipo_solicitud_detalle?: string | null
          tipo_tramite?: string | null
          trazabilidad_indigo?: string | null
          unidad_especial?: string | null
          updated_at?: string
        }
        Update: {
          ambulancia_obligatoria?: boolean | null
          archivado?: boolean
          cama?: string | null
          cie10?: string | null
          codigo_radicacion?: string | null
          contacto_nombre?: string | null
          contacto_parentesco?: string | null
          contacto_telefono?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: string | null
          documento?: string | null
          eapb?: string | null
          eapb_genera_codigo?: boolean | null
          eapb_tiene_plataforma?: boolean | null
          edad?: string | null
          egreso_mismo_dia?: boolean | null
          especialidades_tratantes?: string | null
          estado?: string | null
          estado_ciclo?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_aceptacion?: string | null
          fecha_cierre?: string | null
          fecha_coordinacion_ambulancia?: string | null
          fecha_egreso?: string | null
          fecha_inicio?: string | null
          fecha_prevista_egreso?: string | null
          fecha_radicado?: string | null
          fecha_ultima_evolucion?: string | null
          id?: string
          ips?: string | null
          ips_receptora?: string | null
          motivo_cierre?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          prioridad?: string | null
          proveedor?: string | null
          proveedor_ambulancia?: string | null
          radicacion_estado?: string | null
          regimen?: string | null
          requiere_ambulancia?: string | null
          servicio?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_solicitud?: string | null
          tipo_solicitud_detalle?: string | null
          tipo_tramite?: string | null
          trazabilidad_indigo?: string | null
          unidad_especial?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entrega_firmas: {
        Row: {
          aceptacion: boolean
          caso_id: string
          codigo_verificacion: string | null
          created_at: string
          estado: string
          expira_at: string
          firma_data: string | null
          firma_ip: string | null
          firma_user_agent: string | null
          firmado_at: string | null
          firmante_cargo: string | null
          firmante_documento: string | null
          firmante_empresa: string | null
          firmante_nombre: string | null
          firmante_telefono: string | null
          id: string
          nombre_usuario: string | null
          pdf_hash: string | null
          seguimiento_id: string | null
          snapshot: Json
          tipo_caso: string
          token_hash: string
          updated_at: string
          usuario_genero: string | null
        }
        Insert: {
          aceptacion?: boolean
          caso_id: string
          codigo_verificacion?: string | null
          created_at?: string
          estado?: string
          expira_at: string
          firma_data?: string | null
          firma_ip?: string | null
          firma_user_agent?: string | null
          firmado_at?: string | null
          firmante_cargo?: string | null
          firmante_documento?: string | null
          firmante_empresa?: string | null
          firmante_nombre?: string | null
          firmante_telefono?: string | null
          id?: string
          nombre_usuario?: string | null
          pdf_hash?: string | null
          seguimiento_id?: string | null
          snapshot?: Json
          tipo_caso?: string
          token_hash: string
          updated_at?: string
          usuario_genero?: string | null
        }
        Update: {
          aceptacion?: boolean
          caso_id?: string
          codigo_verificacion?: string | null
          created_at?: string
          estado?: string
          expira_at?: string
          firma_data?: string | null
          firma_ip?: string | null
          firma_user_agent?: string | null
          firmado_at?: string | null
          firmante_cargo?: string | null
          firmante_documento?: string | null
          firmante_empresa?: string | null
          firmante_nombre?: string | null
          firmante_telefono?: string | null
          id?: string
          nombre_usuario?: string | null
          pdf_hash?: string | null
          seguimiento_id?: string | null
          snapshot?: Json
          tipo_caso?: string
          token_hash?: string
          updated_at?: string
          usuario_genero?: string | null
        }
        Relationships: []
      }
      entregas_turno: {
        Row: {
          created_at: string
          created_by: string | null
          entrega_nombre: string | null
          entrega_por: string | null
          id: string
          recibe_nombre: string | null
          recibe_por: string | null
          reinicio_evolucion: boolean
          turno: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entrega_nombre?: string | null
          entrega_por?: string | null
          id?: string
          recibe_nombre?: string | null
          recibe_por?: string | null
          reinicio_evolucion?: boolean
          turno: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entrega_nombre?: string | null
          entrega_por?: string | null
          id?: string
          recibe_nombre?: string | null
          recibe_por?: string | null
          reinicio_evolucion?: boolean
          turno?: string
          updated_at?: string
        }
        Relationships: []
      }
      especialidades_historial: {
        Row: {
          action: string
          caso_id: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          effective_at: string
          especialidad: string
          id: string
          motivo: string | null
          new_status: string | null
          previous_status: string | null
          seguimiento_id: string | null
          tabla: string
          tipo_caso: string | null
        }
        Insert: {
          action: string
          caso_id: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          effective_at?: string
          especialidad: string
          id?: string
          motivo?: string | null
          new_status?: string | null
          previous_status?: string | null
          seguimiento_id?: string | null
          tabla?: string
          tipo_caso?: string | null
        }
        Update: {
          action?: string
          caso_id?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          effective_at?: string
          especialidad?: string
          id?: string
          motivo?: string | null
          new_status?: string | null
          previous_status?: string | null
          seguimiento_id?: string | null
          tabla?: string
          tipo_caso?: string | null
        }
        Relationships: []
      }
      historial_turnos: {
        Row: {
          created_at: string
          created_by: string | null
          entrega: string | null
          fecha_guardado: string | null
          id: string
          rango_turno: string | null
          recibe: string | null
          snapshot: Json | null
          turno: string | null
          updated_at: string
          usuario_inicio: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entrega?: string | null
          fecha_guardado?: string | null
          id?: string
          rango_turno?: string | null
          recibe?: string | null
          snapshot?: Json | null
          turno?: string | null
          updated_at?: string
          usuario_inicio?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entrega?: string | null
          fecha_guardado?: string | null
          id?: string
          rango_turno?: string | null
          recibe?: string | null
          snapshot?: Json | null
          turno?: string | null
          updated_at?: string
          usuario_inicio?: string | null
        }
        Relationships: []
      }
      historicos_casos: {
        Row: {
          archivado: boolean
          asegurador: string | null
          created_at: string
          created_by: string | null
          datos: Json | null
          detalle: string | null
          documento: string | null
          estado: string | null
          fecha: string | null
          fuente_archivo: string | null
          fuente_hoja: string | null
          id: string
          ips: string | null
          paciente: string | null
          radicado: string | null
          seccion: string | null
          tipo_caso: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          asegurador?: string | null
          created_at?: string
          created_by?: string | null
          datos?: Json | null
          detalle?: string | null
          documento?: string | null
          estado?: string | null
          fecha?: string | null
          fuente_archivo?: string | null
          fuente_hoja?: string | null
          id?: string
          ips?: string | null
          paciente?: string | null
          radicado?: string | null
          seccion?: string | null
          tipo_caso?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          asegurador?: string | null
          created_at?: string
          created_by?: string | null
          datos?: Json | null
          detalle?: string | null
          documento?: string | null
          estado?: string | null
          fecha?: string | null
          fuente_archivo?: string | null
          fuente_hoja?: string | null
          id?: string
          ips?: string | null
          paciente?: string | null
          radicado?: string | null
          seccion?: string | null
          tipo_caso?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      indicadores: {
        Row: {
          activo: boolean
          archivado: boolean
          codigo: string | null
          created_at: string
          created_by: string | null
          denominador: string | null
          descripcion: string | null
          fuente: string | null
          id: string
          meta: number | null
          nombre: string | null
          numerador: string | null
          responsable: string | null
          sentido: string | null
          tipo: string | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          archivado?: boolean
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          denominador?: string | null
          descripcion?: string | null
          fuente?: string | null
          id?: string
          meta?: number | null
          nombre?: string | null
          numerador?: string | null
          responsable?: string | null
          sentido?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          archivado?: boolean
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          denominador?: string | null
          descripcion?: string | null
          fuente?: string | null
          id?: string
          meta?: number | null
          nombre?: string | null
          numerador?: string | null
          responsable?: string | null
          sentido?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mediciones_indicadores: {
        Row: {
          calculado_at: string | null
          calculado_by: string | null
          comentario: string | null
          created_at: string
          created_by: string | null
          denominador_valor: number | null
          diferencia_conciliacion: number | null
          fecha: string | null
          fuente_medicion: string | null
          id: string
          indicador_id: string
          meta: number | null
          nota_metodologica: string | null
          numerador_valor: number | null
          periodo: string | null
          periodo_fin: string | null
          periodo_inicio: string | null
          regla_version: string
          resultado: number | null
          resultado_automatico_conciliacion: number | null
          semaforo: string | null
          tipo_medicion: string
          total_evaluables: number | null
          total_excluidos: number | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          calculado_at?: string | null
          calculado_by?: string | null
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          denominador_valor?: number | null
          diferencia_conciliacion?: number | null
          fecha?: string | null
          fuente_medicion?: string | null
          id?: string
          indicador_id: string
          meta?: number | null
          nota_metodologica?: string | null
          numerador_valor?: number | null
          periodo?: string | null
          periodo_fin?: string | null
          periodo_inicio?: string | null
          regla_version?: string
          resultado?: number | null
          resultado_automatico_conciliacion?: number | null
          semaforo?: string | null
          tipo_medicion?: string
          total_evaluables?: number | null
          total_excluidos?: number | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          calculado_at?: string | null
          calculado_by?: string | null
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          denominador_valor?: number | null
          diferencia_conciliacion?: number | null
          fecha?: string | null
          fuente_medicion?: string | null
          id?: string
          indicador_id?: string
          meta?: number | null
          nota_metodologica?: string | null
          numerador_valor?: number | null
          periodo?: string | null
          periodo_fin?: string | null
          periodo_inicio?: string | null
          regla_version?: string
          resultado?: number | null
          resultado_automatico_conciliacion?: number | null
          semaforo?: string | null
          tipo_medicion?: string
          total_evaluables?: number | null
          total_excluidos?: number | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mediciones_indicadores_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          allowed_alert_types: Json
          bot_token: string | null
          channel_type: string
          config_status: string
          created_at: string
          created_by: string | null
          destination_id: string | null
          destination_label: string | null
          display_name: string | null
          enabled: boolean
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_test_at: string | null
          message_template: string | null
          settings: Json
          token_configured: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_alert_types?: Json
          bot_token?: string | null
          channel_type: string
          config_status?: string
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_label?: string | null
          display_name?: string | null
          enabled?: boolean
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          message_template?: string | null
          settings?: Json
          token_configured?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_alert_types?: Json
          bot_token?: string | null
          channel_type?: string
          config_status?: string
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_label?: string | null
          display_name?: string | null
          enabled?: boolean
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          message_template?: string | null
          settings?: Json
          token_configured?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          alert_type: string | null
          attempts: number
          channel_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          message_preview: string | null
          module: string | null
          recipient: string | null
          reference_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          alert_type?: string | null
          attempts?: number
          channel_type: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message_preview?: string | null
          module?: string | null
          recipient?: string | null
          reference_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          alert_type?: string | null
          attempts?: number
          channel_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message_preview?: string | null
          module?: string | null
          recipient?: string | null
          reference_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      pendientes: {
        Row: {
          archivado: boolean
          caso_id: string | null
          created_at: string
          created_by: string | null
          detalles: Json | null
          estado: string | null
          fecha: string | null
          id: string
          ips_area: string | null
          observacion_entrega: string | null
          origen: string | null
          paciente_asunto: string | null
          prioridad: string | null
          tipo_caso: string | null
          tipo_pendiente: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          detalles?: Json | null
          estado?: string | null
          fecha?: string | null
          id?: string
          ips_area?: string | null
          observacion_entrega?: string | null
          origen?: string | null
          paciente_asunto?: string | null
          prioridad?: string | null
          tipo_caso?: string | null
          tipo_pendiente?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          caso_id?: string | null
          created_at?: string
          created_by?: string | null
          detalles?: Json | null
          estado?: string | null
          fecha?: string | null
          id?: string
          ips_area?: string | null
          observacion_entrega?: string | null
          origen?: string | null
          paciente_asunto?: string | null
          prioridad?: string | null
          tipo_caso?: string | null
          tipo_pendiente?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      phd_pad_o2_radicaciones: {
        Row: {
          canal: string
          created_at: string
          created_by: string | null
          domiciliario_id: string
          eapb: string
          fecha_radicacion: string
          id: string
          numero_radicado: string | null
          observaciones: string | null
          soporte_url: string | null
          updated_at: string
        }
        Insert: {
          canal: string
          created_at?: string
          created_by?: string | null
          domiciliario_id: string
          eapb: string
          fecha_radicacion?: string
          id?: string
          numero_radicado?: string | null
          observaciones?: string | null
          soporte_url?: string | null
          updated_at?: string
        }
        Update: {
          canal?: string
          created_at?: string
          created_by?: string | null
          domiciliario_id?: string
          eapb?: string
          fecha_radicacion?: string
          id?: string
          numero_radicado?: string | null
          observaciones?: string | null
          soporte_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phd_pad_o2_radicaciones_domiciliario_id_fkey"
            columns: ["domiciliario_id"]
            isOneToOne: false
            referencedRelation: "domiciliarios"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas: {
        Row: {
          activo: boolean
          archivado: boolean
          categoria: string | null
          condicion: string | null
          created_at: string
          created_by: string | null
          id: string
          indicativo: string | null
          mensaje: string | null
          nombre: string | null
          pasos: string[]
          subcategoria: string | null
          updated_at: string
          variables: string | null
        }
        Insert: {
          activo?: boolean
          archivado?: boolean
          categoria?: string | null
          condicion?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indicativo?: string | null
          mensaje?: string | null
          nombre?: string | null
          pasos?: string[]
          subcategoria?: string | null
          updated_at?: string
          variables?: string | null
        }
        Update: {
          activo?: boolean
          archivado?: boolean
          categoria?: string | null
          condicion?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          indicativo?: string | null
          mensaje?: string | null
          nombre?: string | null
          pasos?: string[]
          subcategoria?: string | null
          updated_at?: string
          variables?: string | null
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
          observaciones: string | null
          sede: string | null
          telefono: string | null
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
          observaciones?: string | null
          sede?: string | null
          telefono?: string | null
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
          observaciones?: string | null
          sede?: string | null
          telefono?: string | null
          tipo_documento?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      red_operativa: {
        Row: {
          ambito: string | null
          archivado: boolean
          cargo_contacto: string | null
          categoria: string | null
          ciudad: string | null
          cobertura: string | null
          codigo_alterno: string | null
          codigo_principal: string | null
          codigos_apoyo: Json
          contacto: string | null
          contacto_principal: string | null
          correo: string | null
          correos_alternos: string | null
          created_at: string
          created_by: string | null
          cups: string | null
          cups_descripcion: string | null
          departamento: string | null
          descripcion: string | null
          direccion: string | null
          disponible_para_remisiones: boolean
          eapb_aseguradoras: string | null
          empresa_tep: string | null
          entidad: string | null
          eps: string | null
          estado: string | null
          fecha_actualizacion_disponibilidad: string | null
          fecha_final: string | null
          fecha_inicio: string | null
          horario: string | null
          id: string
          indicativo: string | null
          ips: string | null
          jornada: string | null
          link: string | null
          medico: string | null
          nit: string | null
          novedad_disponibilidad: string | null
          observaciones: string | null
          opcion_menu: string | null
          orden_visualizacion: number | null
          recorrido: string | null
          relaciones_red: Json
          rondas: string | null
          sede: string | null
          servicio_especialidad: string | null
          subcategoria: string | null
          telefono: string | null
          telefonos_alternos: string | null
          tipo_ambulancia: string | null
          tipo_apoyo: string | null
          tipo_contacto: string | null
          tipo_recurso: string | null
          tipo_red: string | null
          updated_at: string
          usuario_actualizacion: string | null
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          ambito?: string | null
          archivado?: boolean
          cargo_contacto?: string | null
          categoria?: string | null
          ciudad?: string | null
          cobertura?: string | null
          codigo_alterno?: string | null
          codigo_principal?: string | null
          codigos_apoyo?: Json
          contacto?: string | null
          contacto_principal?: string | null
          correo?: string | null
          correos_alternos?: string | null
          created_at?: string
          created_by?: string | null
          cups?: string | null
          cups_descripcion?: string | null
          departamento?: string | null
          descripcion?: string | null
          direccion?: string | null
          disponible_para_remisiones?: boolean
          eapb_aseguradoras?: string | null
          empresa_tep?: string | null
          entidad?: string | null
          eps?: string | null
          estado?: string | null
          fecha_actualizacion_disponibilidad?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          horario?: string | null
          id?: string
          indicativo?: string | null
          ips?: string | null
          jornada?: string | null
          link?: string | null
          medico?: string | null
          nit?: string | null
          novedad_disponibilidad?: string | null
          observaciones?: string | null
          opcion_menu?: string | null
          orden_visualizacion?: number | null
          recorrido?: string | null
          relaciones_red?: Json
          rondas?: string | null
          sede?: string | null
          servicio_especialidad?: string | null
          subcategoria?: string | null
          telefono?: string | null
          telefonos_alternos?: string | null
          tipo_ambulancia?: string | null
          tipo_apoyo?: string | null
          tipo_contacto?: string | null
          tipo_recurso?: string | null
          tipo_red?: string | null
          updated_at?: string
          usuario_actualizacion?: string | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          ambito?: string | null
          archivado?: boolean
          cargo_contacto?: string | null
          categoria?: string | null
          ciudad?: string | null
          cobertura?: string | null
          codigo_alterno?: string | null
          codigo_principal?: string | null
          codigos_apoyo?: Json
          contacto?: string | null
          contacto_principal?: string | null
          correo?: string | null
          correos_alternos?: string | null
          created_at?: string
          created_by?: string | null
          cups?: string | null
          cups_descripcion?: string | null
          departamento?: string | null
          descripcion?: string | null
          direccion?: string | null
          disponible_para_remisiones?: boolean
          eapb_aseguradoras?: string | null
          empresa_tep?: string | null
          entidad?: string | null
          eps?: string | null
          estado?: string | null
          fecha_actualizacion_disponibilidad?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          horario?: string | null
          id?: string
          indicativo?: string | null
          ips?: string | null
          jornada?: string | null
          link?: string | null
          medico?: string | null
          nit?: string | null
          novedad_disponibilidad?: string | null
          observaciones?: string | null
          opcion_menu?: string | null
          orden_visualizacion?: number | null
          recorrido?: string | null
          relaciones_red?: Json
          rondas?: string | null
          sede?: string | null
          servicio_especialidad?: string | null
          subcategoria?: string | null
          telefono?: string | null
          telefonos_alternos?: string | null
          tipo_ambulancia?: string | null
          tipo_apoyo?: string | null
          tipo_contacto?: string | null
          tipo_recurso?: string | null
          tipo_red?: string | null
          updated_at?: string
          usuario_actualizacion?: string | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: []
      }
      referencia_interna: {
        Row: {
          archivado: boolean
          created_at: string
          created_by: string | null
          documento: string | null
          eapb: string | null
          estado: string | null
          evolucion: string | null
          evolucion_actualizada_at: string | null
          evolucion_detalle: string | null
          evolucion_motivo: string | null
          fecha: string | null
          fecha_inicio: string | null
          fecha_radicado: string | null
          id: string
          observaciones: string | null
          paciente: string | null
          prioridad: string | null
          proveedor_prestador: string | null
          servicio: string | null
          tipo_ambulancia: string | null
          tipo_documento: string | null
          tipo_solicitud: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          created_at?: string
          created_by?: string | null
          documento?: string | null
          eapb?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          observaciones?: string | null
          paciente?: string | null
          prioridad?: string | null
          proveedor_prestador?: string | null
          servicio?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_solicitud?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          created_at?: string
          created_by?: string | null
          documento?: string | null
          eapb?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          observaciones?: string | null
          paciente?: string | null
          prioridad?: string | null
          proveedor_prestador?: string | null
          servicio?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_solicitud?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reglas_coordinacion: {
        Row: {
          activo: boolean
          archivado: boolean
          canales: string[]
          codigo: string
          condicion: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          es_base: boolean
          evento: string | null
          id: string
          modulo: string
          nombre: string
          notificar_externo: boolean
          orden: number
          prioridad: string
          requiere_crue: boolean
          subventana: string
          umbral: number | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          archivado?: boolean
          canales?: string[]
          codigo: string
          condicion?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          es_base?: boolean
          evento?: string | null
          id?: string
          modulo?: string
          nombre: string
          notificar_externo?: boolean
          orden?: number
          prioridad?: string
          requiere_crue?: boolean
          subventana?: string
          umbral?: number | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          archivado?: boolean
          canales?: string[]
          codigo?: string
          condicion?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          es_base?: boolean
          evento?: string | null
          id?: string
          modulo?: string
          nombre?: string
          notificar_externo?: boolean
          orden?: number
          prioridad?: string
          requiere_crue?: boolean
          subventana?: string
          umbral?: number | null
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reglas_operativas: {
        Row: {
          accion: string | null
          activo: boolean
          archivado: boolean
          campo: string | null
          created_at: string
          created_by: string | null
          horas: number | null
          id: string
          mensaje: string | null
          modulo: string | null
          nivel: string | null
          nombre: string | null
          tipo_condicion: string | null
          updated_at: string
          valor: string | null
        }
        Insert: {
          accion?: string | null
          activo?: boolean
          archivado?: boolean
          campo?: string | null
          created_at?: string
          created_by?: string | null
          horas?: number | null
          id?: string
          mensaje?: string | null
          modulo?: string | null
          nivel?: string | null
          nombre?: string | null
          tipo_condicion?: string | null
          updated_at?: string
          valor?: string | null
        }
        Update: {
          accion?: string | null
          activo?: boolean
          archivado?: boolean
          campo?: string | null
          created_at?: string
          created_by?: string | null
          horas?: number | null
          id?: string
          mensaje?: string | null
          modulo?: string | null
          nivel?: string | null
          nombre?: string | null
          tipo_condicion?: string | null
          updated_at?: string
          valor?: string | null
        }
        Relationships: []
      }
      remisiones: {
        Row: {
          alcance_red: string | null
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
          departamentos_red_nacional: string | null
          documento: string | null
          eapb: string | null
          eapb_contratada_snapshot: boolean | null
          eapb_genera_codigo: boolean | null
          eapb_snapshot_at: string | null
          eapb_tiene_plataforma: boolean | null
          edad: string | null
          especialidades_receptoras: string | null
          especialidades_tratantes: string | null
          especificacion: string | null
          estado: string | null
          evolucion: string | null
          evolucion_actualizada_at: string | null
          evolucion_detalle: string | null
          evolucion_motivo: string | null
          fecha_inicio: string | null
          fecha_radicado: string | null
          id: string
          ips_receptora: string | null
          ips_red_local: string | null
          observaciones: string | null
          paciente: string | null
          plataforma_funcionando: boolean | null
          pqrs: string | null
          prestador_traslado: string | null
          prioridad: string | null
          regimen: string | null
          remision_por: string | null
          servicio: string | null
          soportes: string | null
          texto_ia: string | null
          tipo_ambulancia: string | null
          tipo_documento: string | null
          tipo_tramite: string | null
          trazabilidad_indigo: string | null
          updated_at: string
        }
        Insert: {
          alcance_red?: string | null
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
          departamentos_red_nacional?: string | null
          documento?: string | null
          eapb?: string | null
          eapb_contratada_snapshot?: boolean | null
          eapb_genera_codigo?: boolean | null
          eapb_snapshot_at?: string | null
          eapb_tiene_plataforma?: boolean | null
          edad?: string | null
          especialidades_receptoras?: string | null
          especialidades_tratantes?: string | null
          especificacion?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips_receptora?: string | null
          ips_red_local?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          pqrs?: string | null
          prestador_traslado?: string | null
          prioridad?: string | null
          regimen?: string | null
          remision_por?: string | null
          servicio?: string | null
          soportes?: string | null
          texto_ia?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_tramite?: string | null
          trazabilidad_indigo?: string | null
          updated_at?: string
        }
        Update: {
          alcance_red?: string | null
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
          departamentos_red_nacional?: string | null
          documento?: string | null
          eapb?: string | null
          eapb_contratada_snapshot?: boolean | null
          eapb_genera_codigo?: boolean | null
          eapb_snapshot_at?: string | null
          eapb_tiene_plataforma?: boolean | null
          edad?: string | null
          especialidades_receptoras?: string | null
          especialidades_tratantes?: string | null
          especificacion?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips_receptora?: string | null
          ips_red_local?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          pqrs?: string | null
          prestador_traslado?: string | null
          prioridad?: string | null
          regimen?: string | null
          remision_por?: string | null
          servicio?: string | null
          soportes?: string | null
          texto_ia?: string | null
          tipo_ambulancia?: string | null
          tipo_documento?: string | null
          tipo_tramite?: string | null
          trazabilidad_indigo?: string | null
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
          detalles: Json | null
          estado_solicitud: string | null
          id: string
          nombre_contacto: string | null
          nombre_usuario: string | null
          plantilla_indigo: string | null
          radicado: string | null
          telefono: string | null
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
          detalles?: Json | null
          estado_solicitud?: string | null
          id?: string
          nombre_contacto?: string | null
          nombre_usuario?: string | null
          plantilla_indigo?: string | null
          radicado?: string | null
          telefono?: string | null
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
          detalles?: Json | null
          estado_solicitud?: string | null
          id?: string
          nombre_contacto?: string | null
          nombre_usuario?: string | null
          plantilla_indigo?: string | null
          radicado?: string | null
          telefono?: string | null
          tipo_caso?: string
          tipo_seguimiento?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shift_absenteeism_records: {
        Row: {
          additional_details: string | null
          annulled_reason: string | null
          approved_at: string | null
          approved_by: string | null
          arl: string | null
          created_at: string
          created_by: string | null
          daily_salary: number | null
          days_number: number
          end_date: string | null
          end_time: string | null
          eps: string | null
          event_code: string | null
          event_name: string | null
          id: string
          identification_number: string | null
          minutes_number: number
          origin: string
          reason: string | null
          registration_date: string
          request_id: string | null
          required_resources: string | null
          role_name: string | null
          start_date: string | null
          start_time: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          worker_name: string | null
        }
        Insert: {
          additional_details?: string | null
          annulled_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arl?: string | null
          created_at?: string
          created_by?: string | null
          daily_salary?: number | null
          days_number?: number
          end_date?: string | null
          end_time?: string | null
          eps?: string | null
          event_code?: string | null
          event_name?: string | null
          id?: string
          identification_number?: string | null
          minutes_number?: number
          origin?: string
          reason?: string | null
          registration_date?: string
          request_id?: string | null
          required_resources?: string | null
          role_name?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          worker_name?: string | null
        }
        Update: {
          additional_details?: string | null
          annulled_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arl?: string | null
          created_at?: string
          created_by?: string | null
          daily_salary?: number | null
          days_number?: number
          end_date?: string | null
          end_time?: string | null
          eps?: string | null
          event_code?: string | null
          event_name?: string | null
          id?: string
          identification_number?: string | null
          minutes_number?: number
          origin?: string
          reason?: string | null
          registration_date?: string
          request_id?: string | null
          required_resources?: string | null
          role_name?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_absenteeism_records_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "shift_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_monthly_exceptions: {
        Row: {
          counts: Json | null
          created_at: string
          id: string
          month: number
          reason: string
          request_type: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          updated_at: string
          usage_status: string
          used_at: string | null
          used_request_id: string | null
          user_id: string
          user_name: string | null
          user_role: string | null
          year: number
        }
        Insert: {
          counts?: Json | null
          created_at?: string
          id?: string
          month: number
          reason: string
          request_type?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          usage_status?: string
          used_at?: string | null
          used_request_id?: string | null
          user_id: string
          user_name?: string | null
          user_role?: string | null
          year: number
        }
        Update: {
          counts?: Json | null
          created_at?: string
          id?: string
          month?: number
          reason?: string
          request_type?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          usage_status?: string
          used_at?: string | null
          used_request_id?: string | null
          user_id?: string
          user_name?: string | null
          user_role?: string | null
          year?: number
        }
        Relationships: []
      }
      shift_request_audit: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          new_status: string | null
          previous_status: string | null
          request_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
          request_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
          request_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_request_audit_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "shift_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_request_recovery_logs: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          observation: string | null
          recovery_date: string | null
          request_id: string
          start_time: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          observation?: string | null
          recovery_date?: string | null
          request_id: string
          start_time?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          observation?: string | null
          recovery_date?: string | null
          request_id?: string
          start_time?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_request_recovery_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "shift_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requests: {
        Row: {
          approval_observation: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          cuadro_applied: boolean
          end_date: string | null
          end_time: string | null
          id: string
          is_limit_exempt: boolean
          monthly_exception_id: string | null
          observations: string | null
          original_end_time: string | null
          original_shift_code: string | null
          original_shift_date: string | null
          original_shift_name: string | null
          original_start_time: string | null
          other_reason: string | null
          out_of_rule_justification: string | null
          paid: boolean | null
          pending_minutes: number | null
          reason_detail: string | null
          reason_recoverable: boolean
          reason_type: string | null
          recovery_status: string | null
          register_absenteeism: boolean
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          replacement_name: string | null
          replacement_role: string | null
          replacement_user_id: string | null
          request_type: string
          requested_minutes: number | null
          requested_shift_code: string | null
          requested_shift_date: string | null
          requester_id: string
          requester_identification: string | null
          requester_name: string | null
          requester_role: string | null
          requester_sede: string | null
          requester_signature_hash: string | null
          requester_signature_id: string | null
          requires_replacement: boolean
          response_observation: string | null
          return_date: string | null
          return_fractioned: boolean
          return_person_id: string | null
          return_person_name: string | null
          return_person_role: string | null
          return_receiver_id: string | null
          return_shift_code: string | null
          returned_minutes: number
          start_date: string | null
          start_time: string | null
          status: string
          support_metadata: Json | null
          support_path: string | null
          swap_partner_name: string | null
          swap_user_id: string | null
          updated_at: string
          will_recover_time: boolean
        }
        Insert: {
          approval_observation?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          cuadro_applied?: boolean
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_limit_exempt?: boolean
          monthly_exception_id?: string | null
          observations?: string | null
          original_end_time?: string | null
          original_shift_code?: string | null
          original_shift_date?: string | null
          original_shift_name?: string | null
          original_start_time?: string | null
          other_reason?: string | null
          out_of_rule_justification?: string | null
          paid?: boolean | null
          pending_minutes?: number | null
          reason_detail?: string | null
          reason_recoverable?: boolean
          reason_type?: string | null
          recovery_status?: string | null
          register_absenteeism?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replacement_name?: string | null
          replacement_role?: string | null
          replacement_user_id?: string | null
          request_type?: string
          requested_minutes?: number | null
          requested_shift_code?: string | null
          requested_shift_date?: string | null
          requester_id: string
          requester_identification?: string | null
          requester_name?: string | null
          requester_role?: string | null
          requester_sede?: string | null
          requester_signature_hash?: string | null
          requester_signature_id?: string | null
          requires_replacement?: boolean
          response_observation?: string | null
          return_date?: string | null
          return_fractioned?: boolean
          return_person_id?: string | null
          return_person_name?: string | null
          return_person_role?: string | null
          return_receiver_id?: string | null
          return_shift_code?: string | null
          returned_minutes?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          support_metadata?: Json | null
          support_path?: string | null
          swap_partner_name?: string | null
          swap_user_id?: string | null
          updated_at?: string
          will_recover_time?: boolean
        }
        Update: {
          approval_observation?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          cuadro_applied?: boolean
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_limit_exempt?: boolean
          monthly_exception_id?: string | null
          observations?: string | null
          original_end_time?: string | null
          original_shift_code?: string | null
          original_shift_date?: string | null
          original_shift_name?: string | null
          original_start_time?: string | null
          other_reason?: string | null
          out_of_rule_justification?: string | null
          paid?: boolean | null
          pending_minutes?: number | null
          reason_detail?: string | null
          reason_recoverable?: boolean
          reason_type?: string | null
          recovery_status?: string | null
          register_absenteeism?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          replacement_name?: string | null
          replacement_role?: string | null
          replacement_user_id?: string | null
          request_type?: string
          requested_minutes?: number | null
          requested_shift_code?: string | null
          requested_shift_date?: string | null
          requester_id?: string
          requester_identification?: string | null
          requester_name?: string | null
          requester_role?: string | null
          requester_sede?: string | null
          requester_signature_hash?: string | null
          requester_signature_id?: string | null
          requires_replacement?: boolean
          response_observation?: string | null
          return_date?: string | null
          return_fractioned?: boolean
          return_person_id?: string | null
          return_person_name?: string | null
          return_person_role?: string | null
          return_receiver_id?: string | null
          return_shift_code?: string | null
          returned_minutes?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          support_metadata?: Json | null
          support_path?: string | null
          swap_partner_name?: string | null
          swap_user_id?: string | null
          updated_at?: string
          will_recover_time?: boolean
        }
        Relationships: []
      }
      shift_return_fragments: {
        Row: {
          created_at: string
          end_time: string | null
          fragment_no: number
          id: string
          minutes: number
          notes: string | null
          receiver_id: string | null
          receiver_name: string | null
          receiver_role: string | null
          request_id: string
          return_date: string | null
          shift_code: string | null
          start_time: string | null
          updated_at: string
          verification_notes: string | null
          verification_result: string
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
          verified_minutes: number
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          fragment_no?: number
          id?: string
          minutes?: number
          notes?: string | null
          receiver_id?: string | null
          receiver_name?: string | null
          receiver_role?: string | null
          request_id: string
          return_date?: string | null
          shift_code?: string | null
          start_time?: string | null
          updated_at?: string
          verification_notes?: string | null
          verification_result?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          verified_minutes?: number
        }
        Update: {
          created_at?: string
          end_time?: string | null
          fragment_no?: number
          id?: string
          minutes?: number
          notes?: string | null
          receiver_id?: string | null
          receiver_name?: string | null
          receiver_role?: string | null
          request_id?: string
          return_date?: string | null
          shift_code?: string | null
          start_time?: string | null
          updated_at?: string
          verification_notes?: string | null
          verification_result?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
          verified_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_return_fragments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "shift_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_schedule_days: {
        Row: {
          changed_at: string
          changed_by: string | null
          day_number: number
          hours: number
          id: string
          member_id: string
          notes: string | null
          origin: string
          schedule_id: string
          shift_code: string | null
          shift_date: string | null
          unidad_funcional: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          day_number: number
          hours?: number
          id?: string
          member_id: string
          notes?: string | null
          origin?: string
          schedule_id: string
          shift_code?: string | null
          shift_date?: string | null
          unidad_funcional?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          day_number?: number
          hours?: number
          id?: string
          member_id?: string
          notes?: string | null
          origin?: string
          schedule_id?: string
          shift_code?: string | null
          shift_date?: string | null
          unidad_funcional?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_schedule_days_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "shift_schedule_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_schedule_days_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "shift_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_schedule_members: {
        Row: {
          active: boolean
          base_hours: number | null
          created_at: string
          full_name: string
          id: string
          identification_number: string | null
          notes: string | null
          pending_hours: number
          role_name: string | null
          schedule_id: string
          sede: string | null
          sort_order: number
          unidad_funcional: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          base_hours?: number | null
          created_at?: string
          full_name?: string
          id?: string
          identification_number?: string | null
          notes?: string | null
          pending_hours?: number
          role_name?: string | null
          schedule_id: string
          sede?: string | null
          sort_order?: number
          unidad_funcional?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          base_hours?: number | null
          created_at?: string
          full_name?: string
          id?: string
          identification_number?: string | null
          notes?: string | null
          pending_hours?: number
          role_name?: string | null
          schedule_id?: string
          sede?: string | null
          sort_order?: number
          unidad_funcional?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_schedule_members_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "shift_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_schedules: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          base_hours: number
          created_at: string
          created_by: string | null
          dependency: string
          elaborated_by: string | null
          id: string
          month: number
          notes: string | null
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          base_hours?: number
          created_at?: string
          created_by?: string | null
          dependency?: string
          elaborated_by?: string | null
          id?: string
          month: number
          notes?: string | null
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          base_hours?: number
          created_at?: string
          created_by?: string | null
          dependency?: string
          elaborated_by?: string | null
          id?: string
          month?: number
          notes?: string | null
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      shift_types: {
        Row: {
          abbr: string | null
          active: boolean
          code: string
          color: string
          created_at: string
          created_by: string | null
          end_time: string | null
          hours: number
          icon: string | null
          id: string
          kind: string
          name: string
          observation: string | null
          sort_order: number
          start_time: string | null
          sums_hours: boolean
          updated_at: string
        }
        Insert: {
          abbr?: string | null
          active?: boolean
          code: string
          color?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          hours?: number
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          observation?: string | null
          sort_order?: number
          start_time?: string | null
          sums_hours?: boolean
          updated_at?: string
        }
        Update: {
          abbr?: string | null
          active?: boolean
          code?: string
          color?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          hours?: number
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          observation?: string | null
          sort_order?: number
          start_time?: string | null
          sums_hours?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      turnos: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          entrega: string | null
          fecha_guardado: string | null
          id: string
          pendientes_generales: string | null
          rango_turno: string | null
          recibe: string | null
          turno: string | null
          updated_at: string
          usuario_inicio: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          entrega?: string | null
          fecha_guardado?: string | null
          id?: string
          pendientes_generales?: string | null
          rango_turno?: string | null
          recibe?: string | null
          turno?: string | null
          updated_at?: string
          usuario_inicio?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          entrega?: string | null
          fecha_guardado?: string | null
          id?: string
          pendientes_generales?: string | null
          rango_turno?: string | null
          recibe?: string | null
          turno?: string | null
          updated_at?: string
          usuario_inicio?: string | null
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
      user_signatures: {
        Row: {
          active: boolean
          created_at: string
          id: string
          signature_hash: string | null
          signature_path: string | null
          updated_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          signature_hash?: string | null
          signature_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          signature_hash?: string | null
          signature_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      voice_dictation_config: {
        Row: {
          activo: boolean
          actualizado_por: string | null
          creado_por: string | null
          created_at: string
          id: string
          idioma: string
          key: string
          modo_insercion: string
          modulo: string
          nombre_campo: string
          roles_permitidos: string[]
          selector: string | null
          subventana: string
          texto_ayuda: string | null
          tipo_campo: string
          updated_at: string
          ventana: string
        }
        Insert: {
          activo?: boolean
          actualizado_por?: string | null
          creado_por?: string | null
          created_at?: string
          id?: string
          idioma?: string
          key: string
          modo_insercion?: string
          modulo?: string
          nombre_campo?: string
          roles_permitidos?: string[]
          selector?: string | null
          subventana?: string
          texto_ayuda?: string | null
          tipo_campo?: string
          updated_at?: string
          ventana?: string
        }
        Update: {
          activo?: boolean
          actualizado_por?: string | null
          creado_por?: string | null
          created_at?: string
          id?: string
          idioma?: string
          key?: string
          modo_insercion?: string
          modulo?: string
          nombre_campo?: string
          roles_permitidos?: string[]
          selector?: string | null
          subventana?: string
          texto_ayuda?: string | null
          tipo_campo?: string
          updated_at?: string
          ventana?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_indicadores_mes: {
        Args: { _month: number; _year: number }
        Returns: {
          out_codigo: string
          out_den: number
          out_num: number
          out_res: number
          out_tipo: string
        }[]
      }
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_member: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      registrar_auditoria: {
        Args: {
          _accion: string
          _detalles?: Json
          _ip?: string
          _modulo?: string
          _registro_id?: string
          _resultado?: string
          _tabla?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      registrar_auditoria_srv: {
        Args: {
          _accion: string
          _detalles?: Json
          _ip?: string
          _modulo?: string
          _registro_id?: string
          _resultado?: string
          _tabla?: string
          _user_agent?: string
          _user_id: string
        }
        Returns: undefined
      }
      shift_monthly_usage: {
        Args: { _month: number; _user_id: string; _year: number }
        Returns: {
          aprobadas: number
          coberturas: number
          exentos: number
          pendientes: number
          solicitudes: number
        }[]
      }
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
