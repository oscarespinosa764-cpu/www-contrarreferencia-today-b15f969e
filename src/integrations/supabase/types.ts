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
          extra3: string | null
          id: string
          radica_oxigeno: boolean
          radica_pad: boolean
          radica_phd: boolean
          radica_unidad_especial: boolean
          tipo: string
          updated_at: string
          valor: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          extra1?: string | null
          extra2?: string | null
          extra3?: string | null
          id?: string
          radica_oxigeno?: boolean
          radica_pad?: boolean
          radica_phd?: boolean
          radica_unidad_especial?: boolean
          tipo: string
          updated_at?: string
          valor: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          extra1?: string | null
          extra2?: string | null
          extra3?: string | null
          id?: string
          radica_oxigeno?: boolean
          radica_pad?: boolean
          radica_phd?: boolean
          radica_unidad_especial?: boolean
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
          especialidades_tratantes: string | null
          estado: string | null
          evolucion: string | null
          evolucion_actualizada_at: string | null
          evolucion_detalle: string | null
          evolucion_motivo: string | null
          fecha: string | null
          fecha_inicio: string | null
          fecha_radicado: string | null
          id: string
          ips: string | null
          ips_receptora: string | null
          observaciones: string | null
          paciente: string | null
          plataforma_funcionando: boolean | null
          prioridad: string | null
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
          especialidades_tratantes?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips?: string | null
          ips_receptora?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          prioridad?: string | null
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
          especialidades_tratantes?: string | null
          estado?: string | null
          evolucion?: string | null
          evolucion_actualizada_at?: string | null
          evolucion_detalle?: string | null
          evolucion_motivo?: string | null
          fecha?: string | null
          fecha_inicio?: string | null
          fecha_radicado?: string | null
          id?: string
          ips?: string | null
          ips_receptora?: string | null
          observaciones?: string | null
          paciente?: string | null
          plataforma_funcionando?: boolean | null
          prioridad?: string | null
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
          comentario: string | null
          created_at: string
          created_by: string | null
          denominador_valor: number | null
          fecha: string | null
          id: string
          indicador_id: string
          meta: number | null
          numerador_valor: number | null
          periodo: string | null
          resultado: number | null
          semaforo: string | null
          unidad: string | null
          updated_at: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          denominador_valor?: number | null
          fecha?: string | null
          id?: string
          indicador_id: string
          meta?: number | null
          numerador_valor?: number | null
          periodo?: string | null
          resultado?: number | null
          semaforo?: string | null
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          created_by?: string | null
          denominador_valor?: number | null
          fecha?: string | null
          id?: string
          indicador_id?: string
          meta?: number | null
          numerador_valor?: number | null
          periodo?: string | null
          resultado?: number | null
          semaforo?: string | null
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
      red_operativa: {
        Row: {
          archivado: boolean
          categoria: string | null
          ciudad: string | null
          contacto: string | null
          correo: string | null
          created_at: string
          created_by: string | null
          cups: string | null
          departamento: string | null
          entidad: string | null
          eps: string | null
          estado: string | null
          fecha_final: string | null
          fecha_inicio: string | null
          id: string
          ips: string | null
          link: string | null
          medico: string | null
          observaciones: string | null
          rondas: string | null
          servicio_especialidad: string | null
          subcategoria: string | null
          telefono: string | null
          tipo_ambulancia: string | null
          tipo_contacto: string | null
          updated_at: string
        }
        Insert: {
          archivado?: boolean
          categoria?: string | null
          ciudad?: string | null
          contacto?: string | null
          correo?: string | null
          created_at?: string
          created_by?: string | null
          cups?: string | null
          departamento?: string | null
          entidad?: string | null
          eps?: string | null
          estado?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          id?: string
          ips?: string | null
          link?: string | null
          medico?: string | null
          observaciones?: string | null
          rondas?: string | null
          servicio_especialidad?: string | null
          subcategoria?: string | null
          telefono?: string | null
          tipo_ambulancia?: string | null
          tipo_contacto?: string | null
          updated_at?: string
        }
        Update: {
          archivado?: boolean
          categoria?: string | null
          ciudad?: string | null
          contacto?: string | null
          correo?: string | null
          created_at?: string
          created_by?: string | null
          cups?: string | null
          departamento?: string | null
          entidad?: string | null
          eps?: string | null
          estado?: string | null
          fecha_final?: string | null
          fecha_inicio?: string | null
          id?: string
          ips?: string | null
          link?: string | null
          medico?: string | null
          observaciones?: string | null
          rondas?: string | null
          servicio_especialidad?: string | null
          subcategoria?: string | null
          telefono?: string | null
          tipo_ambulancia?: string | null
          tipo_contacto?: string | null
          updated_at?: string
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
          eapb_genera_codigo: boolean | null
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
          eapb_genera_codigo?: boolean | null
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
          eapb_genera_codigo?: boolean | null
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
