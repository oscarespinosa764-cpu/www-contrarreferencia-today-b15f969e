import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Confirmación de cambio de correo — CEDIM IPS</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>CEDIM IPS</Heading>
          <Text style={subBrand}>REFERENCIA Y CONTRARREFERENCIA</Text>
        </Section>
        <Heading style={h1}>CONFIRMACIÓN DE CAMBIO DE CORREO</Heading>
        <Text style={text}>
          SE SOLICITÓ EL CAMBIO DEL CORREO DE ACCESO DE <strong>{oldEmail}</strong>{' '}
          A <strong>{newEmail}</strong>.
        </Text>
        <Text style={text}>PARA CONFIRMAR ESTE CAMBIO, PRESIONE EL SIGUIENTE BOTÓN:</Text>
        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button style={button} href={confirmationUrl}>
            CONFIRMAR CAMBIO DE CORREO
          </Button>
        </Section>
        <Text style={footer}>
          SI USTED NO SOLICITÓ ESTE CAMBIO, COMUNÍQUESE INMEDIATAMENTE CON LA
          COORDINACIÓN RESPONSABLE.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const header = { borderBottom: '2px solid #0f4c81', paddingBottom: '12px', marginBottom: '20px' }
const brand = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0f4c81', margin: 0 }
const subBrand = { fontSize: '11px', color: '#0f4c81', letterSpacing: '1px', margin: '2px 0 0' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#111827', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 14px' }
const button = {
  backgroundColor: '#0f4c81',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '6px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#6b7280', margin: '24px 0 0', lineHeight: '1.5' }
