-- Migration: 004_auth_users.sql
-- Tabla de usuarios autorizados para acceder al sistema

CREATE TABLE IF NOT EXISTS authorized_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_authorized_users_email ON authorized_users(email);
CREATE INDEX IF NOT EXISTS idx_authorized_users_active ON authorized_users(is_active);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_authorized_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_authorized_users_updated_at ON authorized_users;
CREATE TRIGGER trigger_authorized_users_updated_at
  BEFORE UPDATE ON authorized_users
  FOR EACH ROW
  EXECUTE FUNCTION update_authorized_users_updated_at();

-- RLS
ALTER TABLE authorized_users ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver y modificar usuarios autorizados
CREATE POLICY "Admins can view authorized_users"
  ON authorized_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM authorized_users au
      WHERE au.email = auth.jwt()->>'email'
      AND au.role = 'admin'
      AND au.is_active = true
    )
  );

CREATE POLICY "Admins can insert authorized_users"
  ON authorized_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM authorized_users au
      WHERE au.email = auth.jwt()->>'email'
      AND au.role = 'admin'
      AND au.is_active = true
    )
  );

CREATE POLICY "Admins can update authorized_users"
  ON authorized_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM authorized_users au
      WHERE au.email = auth.jwt()->>'email'
      AND au.role = 'admin'
      AND au.is_active = true
    )
  );

-- Función para verificar si un usuario está autorizado
CREATE OR REPLACE FUNCTION is_user_authorized(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = user_email
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insertar usuarios iniciales
INSERT INTO authorized_users (email, name, role) VALUES
  ('julianm91@gmail.com', 'Julian Martel', 'admin'),
  ('admin@quilmescorrugados.com.ar', 'Administrador', 'admin')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = true;
