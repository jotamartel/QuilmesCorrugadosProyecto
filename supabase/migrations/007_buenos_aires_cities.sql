/**
 * Migración 007: Ciudades de Buenos Aires con Distancias a Quilmes
 *
 * - Crea tabla buenos_aires_cities con distancias precalculadas
 * - Permite calcular si aplica envío gratis (60km desde Quilmes)
 * - Agrega campo distance_km a public_quotes
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA BUENOS_AIRES_CITIES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS buenos_aires_cities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- Nombre de la ciudad/localidad
  partido TEXT,                          -- Partido/Municipio al que pertenece
  distance_km DECIMAL(6,1) NOT NULL,     -- Distancia en km desde Quilmes
  is_free_shipping BOOLEAN GENERATED ALWAYS AS (distance_km <= 60) STORED,
  postal_codes TEXT[],                   -- Códigos postales asociados
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ba_cities_name ON buenos_aires_cities(name);
CREATE INDEX IF NOT EXISTS idx_ba_cities_partido ON buenos_aires_cities(partido);
CREATE INDEX IF NOT EXISTS idx_ba_cities_distance ON buenos_aires_cities(distance_km);
CREATE INDEX IF NOT EXISTS idx_ba_cities_free_shipping ON buenos_aires_cities(is_free_shipping);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS DE CIUDADES (Distancias aproximadas a Quilmes Centro)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO buenos_aires_cities (name, partido, distance_km, postal_codes) VALUES
-- QUILMES Y ALREDEDORES (0-10 km)
('Quilmes Centro', 'Quilmes', 0, ARRAY['1878']),
('Quilmes Oeste', 'Quilmes', 3, ARRAY['1879']),
('Bernal', 'Quilmes', 4, ARRAY['1876']),
('Bernal Oeste', 'Quilmes', 5, ARRAY['1876']),
('Don Bosco', 'Quilmes', 5, ARRAY['1878']),
('San Francisco Solano', 'Quilmes', 8, ARRAY['1881']),
('Ezpeleta', 'Quilmes', 6, ARRAY['1882']),
('Ezpeleta Oeste', 'Quilmes', 7, ARRAY['1882']),

-- BERAZATEGUI (5-15 km)
('Berazategui', 'Berazategui', 8, ARRAY['1884']),
('Ranelagh', 'Berazategui', 10, ARRAY['1886']),
('Plátanos', 'Berazategui', 12, ARRAY['1885']),
('Pereyra', 'Berazategui', 14, ARRAY['1894']),
('Hudson', 'Berazategui', 16, ARRAY['1885']),
('Gutiérrez', 'Berazategui', 18, ARRAY['1885']),

-- FLORENCIO VARELA (10-20 km)
('Florencio Varela', 'Florencio Varela', 12, ARRAY['1888']),
('Bosques', 'Florencio Varela', 14, ARRAY['1889']),
('Zeballos', 'Florencio Varela', 16, ARRAY['1888']),
('Gobernador Costa', 'Florencio Varela', 15, ARRAY['1888']),
('Ingeniero Allan', 'Florencio Varela', 18, ARRAY['1888']),
('La Capilla', 'Florencio Varela', 20, ARRAY['1888']),

-- AVELLANEDA (8-15 km)
('Avellaneda', 'Avellaneda', 8, ARRAY['1870']),
('Sarandí', 'Avellaneda', 6, ARRAY['1872']),
('Dock Sud', 'Avellaneda', 10, ARRAY['1871']),
('Villa Domínico', 'Avellaneda', 5, ARRAY['1874']),
('Wilde', 'Avellaneda', 4, ARRAY['1875']),
('Gerli', 'Avellaneda', 9, ARRAY['1868']),
('Piñeyro', 'Avellaneda', 10, ARRAY['1870']),
('Crucecita', 'Avellaneda', 8, ARRAY['1870']),

-- LANÚS (10-15 km)
('Lanús', 'Lanús', 10, ARRAY['1824']),
('Lanús Este', 'Lanús', 9, ARRAY['1824']),
('Lanús Oeste', 'Lanús', 11, ARRAY['1824']),
('Remedios de Escalada', 'Lanús', 12, ARRAY['1826']),
('Valentín Alsina', 'Lanús', 13, ARRAY['1822']),
('Monte Chingolo', 'Lanús', 8, ARRAY['1825']),
('Gerli', 'Lanús', 10, ARRAY['1823']),

-- LOMAS DE ZAMORA (12-18 km)
('Lomas de Zamora', 'Lomas de Zamora', 14, ARRAY['1832']),
('Banfield', 'Lomas de Zamora', 12, ARRAY['1828']),
('Temperley', 'Lomas de Zamora', 15, ARRAY['1834']),
('Turdera', 'Lomas de Zamora', 16, ARRAY['1835']),
('Llavallol', 'Lomas de Zamora', 18, ARRAY['1836']),
('Ingeniero Budge', 'Lomas de Zamora', 13, ARRAY['1832']),
('Villa Fiorito', 'Lomas de Zamora', 15, ARRAY['1833']),
('Villa Centenario', 'Lomas de Zamora', 14, ARRAY['1832']),

-- ALMIRANTE BROWN (15-25 km)
('Adrogué', 'Almirante Brown', 17, ARRAY['1846']),
('Burzaco', 'Almirante Brown', 20, ARRAY['1852']),
('José Mármol', 'Almirante Brown', 19, ARRAY['1845']),
('Rafael Calzada', 'Almirante Brown', 16, ARRAY['1847']),
('Claypole', 'Almirante Brown', 21, ARRAY['1849']),
('Don Orione', 'Almirante Brown', 22, ARRAY['1850']),
('Longchamps', 'Almirante Brown', 23, ARRAY['1854']),
('Glew', 'Almirante Brown', 28, ARRAY['1856']),
('Ministro Rivadavia', 'Almirante Brown', 18, ARRAY['1848']),

-- ESTEBAN ECHEVERRÍA (18-30 km)
('Monte Grande', 'Esteban Echeverría', 22, ARRAY['1842']),
('El Jagüel', 'Esteban Echeverría', 28, ARRAY['1842']),
('Luis Guillón', 'Esteban Echeverría', 20, ARRAY['1838']),
('9 de Abril', 'Esteban Echeverría', 24, ARRAY['1841']),
('Canning', 'Esteban Echeverría', 30, ARRAY['1804']),

-- EZEIZA (25-40 km)
('Ezeiza', 'Ezeiza', 32, ARRAY['1804']),
('Tristán Suárez', 'Ezeiza', 35, ARRAY['1806']),
('Carlos Spegazzini', 'Ezeiza', 38, ARRAY['1812']),
('La Unión', 'Ezeiza', 30, ARRAY['1804']),

-- PRESIDENTE PERÓN (25-35 km)
('Guernica', 'Presidente Perón', 28, ARRAY['1862']),
('San Martín', 'Presidente Perón', 30, ARRAY['1862']),

-- SAN VICENTE (35-50 km)
('San Vicente', 'San Vicente', 45, ARRAY['1865']),
('Alejandro Korn', 'San Vicente', 35, ARRAY['1864']),
('Domselaar', 'San Vicente', 50, ARRAY['1865']),

-- LA PLATA (20-35 km)
('La Plata', 'La Plata', 22, ARRAY['1900']),
('City Bell', 'La Plata', 28, ARRAY['1896']),
('Gonnet', 'La Plata', 26, ARRAY['1897']),
('Villa Elisa', 'La Plata', 24, ARRAY['1894']),
('Tolosa', 'La Plata', 21, ARRAY['1902']),
('Ringuelet', 'La Plata', 23, ARRAY['1903']),
('Los Hornos', 'La Plata', 25, ARRAY['1900']),
('Ensenada', 'La Plata', 28, ARRAY['1925']),
('Berisso', 'La Plata', 30, ARRAY['1923']),
('Abasto', 'La Plata', 32, ARRAY['1900']),
('Olmos', 'La Plata', 35, ARRAY['1900']),
('Melchor Romero', 'La Plata', 30, ARRAY['1903']),
('Arturo Seguí', 'La Plata', 34, ARRAY['1896']),

-- CABA (15-25 km)
('Ciudad de Buenos Aires', 'CABA', 18, ARRAY['1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008', '1009', '1010', '1011', '1012', '1013', '1014', '1015', '1016', '1017', '1018', '1019', '1020', '1021', '1022', '1023', '1024', '1025', '1026', '1027', '1028', '1029', '1030', '1031', '1032', '1033', '1034', '1035', '1036', '1037', '1038', '1039', '1040', '1041', '1042', '1043', '1044', '1045', '1046', '1047', '1048', '1049', '1050', '1051', '1052', '1053', '1054', '1055', '1056', '1057', '1058', '1059', '1060', '1061', '1062', '1063', '1064', '1065', '1066', '1067', '1068', '1069', '1070', '1071', '1072', '1073', '1074', '1075', '1076', '1077', '1078', '1079', '1080', '1081', '1082', '1083', '1084', '1085', '1086', '1087', '1088', '1089', '1090', '1091', '1092', '1093', '1094', '1095', '1096', '1097', '1098', '1099', '1100', '1200', '1400', '1406', '1407', '1408', '1414', '1416', '1417', '1418', '1419', '1424', '1425', '1426', '1427', '1428', '1429', '1430', '1431']),

-- VICENTE LÓPEZ (20-25 km)
('Vicente López', 'Vicente López', 22, ARRAY['1638']),
('Olivos', 'Vicente López', 24, ARRAY['1636']),
('Florida', 'Vicente López', 23, ARRAY['1602']),
('Munro', 'Vicente López', 25, ARRAY['1605']),
('Villa Martelli', 'Vicente López', 24, ARRAY['1603']),
('La Lucila', 'Vicente López', 25, ARRAY['1636']),

-- SAN ISIDRO (25-35 km)
('San Isidro', 'San Isidro', 28, ARRAY['1642']),
('Martínez', 'San Isidro', 27, ARRAY['1640']),
('Acassuso', 'San Isidro', 28, ARRAY['1641']),
('Béccar', 'San Isidro', 30, ARRAY['1643']),
('Boulogne', 'San Isidro', 32, ARRAY['1609']),
('San Isidro Centro', 'San Isidro', 28, ARRAY['1642']),

-- SAN FERNANDO (30-38 km)
('San Fernando', 'San Fernando', 32, ARRAY['1646']),
('Victoria', 'San Fernando', 34, ARRAY['1644']),
('Virreyes', 'San Fernando', 33, ARRAY['1645']),

-- TIGRE (35-50 km)
('Tigre', 'Tigre', 38, ARRAY['1648']),
('Don Torcuato', 'Tigre', 35, ARRAY['1611']),
('General Pacheco', 'Tigre', 40, ARRAY['1617']),
('El Talar', 'Tigre', 37, ARRAY['1618']),
('Ricardo Rojas', 'Tigre', 36, ARRAY['1618']),
('Benavídez', 'Tigre', 45, ARRAY['1621']),
('Nordelta', 'Tigre', 42, ARRAY['1670']),
('Rincón de Milberg', 'Tigre', 40, ARRAY['1648']),

-- SAN MARTÍN (20-28 km)
('San Martín', 'General San Martín', 22, ARRAY['1650']),
('Villa Ballester', 'General San Martín', 24, ARRAY['1653']),
('José León Suárez', 'General San Martín', 26, ARRAY['1655']),
('San Andrés', 'General San Martín', 25, ARRAY['1651']),
('Villa Lynch', 'General San Martín', 23, ARRAY['1651']),
('Villa Maipú', 'General San Martín', 22, ARRAY['1650']),
('Billinghurst', 'General San Martín', 24, ARRAY['1652']),
('Chilavert', 'General San Martín', 21, ARRAY['1650']),

-- TRES DE FEBRERO (22-30 km)
('Caseros', 'Tres de Febrero', 24, ARRAY['1678']),
('Ciudadela', 'Tres de Febrero', 20, ARRAY['1702']),
('Santos Lugares', 'Tres de Febrero', 23, ARRAY['1676']),
('Sáenz Peña', 'Tres de Febrero', 25, ARRAY['1674']),
('El Palomar', 'Tres de Febrero', 28, ARRAY['1684']),
('Ciudad Jardín', 'Tres de Febrero', 29, ARRAY['1684']),
('Pablo Podestá', 'Tres de Febrero', 26, ARRAY['1679']),
('Martín Coronado', 'Tres de Febrero', 27, ARRAY['1682']),
('Villa Bosch', 'Tres de Febrero', 24, ARRAY['1682']),

-- LA MATANZA ESTE (15-25 km)
('San Justo', 'La Matanza', 20, ARRAY['1754']),
('Ramos Mejía', 'La Matanza', 18, ARRAY['1704']),
('Villa Luzuriaga', 'La Matanza', 19, ARRAY['1753']),
('Villa Madero', 'La Matanza', 15, ARRAY['1768']),
('Tapiales', 'La Matanza', 17, ARRAY['1770']),
('Aldo Bonzi', 'La Matanza', 18, ARRAY['1770']),
('La Tablada', 'La Matanza', 16, ARRAY['1766']),
('Ciudad Evita', 'La Matanza', 20, ARRAY['1778']),
('Isidro Casanova', 'La Matanza', 22, ARRAY['1765']),
('Villa Celina', 'La Matanza', 14, ARRAY['1771']),
('Villa Insuperable', 'La Matanza', 21, ARRAY['1754']),

-- LA MATANZA OESTE (25-45 km)
('González Catán', 'La Matanza', 30, ARRAY['1759']),
('Gregorio de Laferrere', 'La Matanza', 28, ARRAY['1757']),
('Rafael Castillo', 'La Matanza', 26, ARRAY['1755']),
('Virrey del Pino', 'La Matanza', 40, ARRAY['1763']),
('20 de Junio', 'La Matanza', 38, ARRAY['1763']),

-- MORÓN (22-30 km)
('Morón', 'Morón', 25, ARRAY['1708']),
('Haedo', 'Morón', 24, ARRAY['1706']),
('Villa Sarmiento', 'Morón', 22, ARRAY['1706']),
('El Palomar', 'Morón', 28, ARRAY['1684']),
('Castelar', 'Morón', 28, ARRAY['1712']),

-- HURLINGHAM (25-32 km)
('Hurlingham', 'Hurlingham', 28, ARRAY['1686']),
('Villa Tesei', 'Hurlingham', 27, ARRAY['1688']),
('William Morris', 'Hurlingham', 30, ARRAY['1686']),

-- ITUZAINGÓ (28-38 km)
('Ituzaingó', 'Ituzaingó', 32, ARRAY['1714']),
('Villa Udaondo', 'Ituzaingó', 35, ARRAY['1714']),

-- MERLO (32-45 km)
('Merlo', 'Merlo', 38, ARRAY['1722']),
('San Antonio de Padua', 'Merlo', 35, ARRAY['1718']),
('Libertad', 'Merlo', 40, ARRAY['1716']),
('Mariano Acosta', 'Merlo', 42, ARRAY['1722']),
('Pontevedra', 'Merlo', 45, ARRAY['1722']),

-- MORENO (35-50 km)
('Moreno', 'Moreno', 42, ARRAY['1744']),
('Paso del Rey', 'Moreno', 38, ARRAY['1742']),
('Francisco Álvarez', 'Moreno', 48, ARRAY['1746']),
('La Reja', 'Moreno', 52, ARRAY['1748']),
('Trujui', 'Moreno', 45, ARRAY['1744']),

-- PILAR (45-65 km)
('Pilar', 'Pilar', 55, ARRAY['1629']),
('Del Viso', 'Pilar', 48, ARRAY['1669']),
('Tortuguitas', 'Pilar', 45, ARRAY['1667']),
('Presidente Derqui', 'Pilar', 58, ARRAY['1635']),
('Villa Rosa', 'Pilar', 52, ARRAY['1631']),
('Fátima', 'Pilar', 60, ARRAY['1633']),
('Manzanares', 'Pilar', 50, ARRAY['1627']),

-- ESCOBAR (45-60 km)
('Escobar', 'Escobar', 52, ARRAY['1625']),
('Belén de Escobar', 'Escobar', 52, ARRAY['1625']),
('Garín', 'Escobar', 48, ARRAY['1619']),
('Ingeniero Maschwitz', 'Escobar', 45, ARRAY['1623']),
('Matheu', 'Escobar', 55, ARRAY['1625']),
('Maquinista Savio', 'Escobar', 50, ARRAY['1625']),

-- MALVINAS ARGENTINAS (35-45 km)
('Los Polvorines', 'Malvinas Argentinas', 38, ARRAY['1613']),
('Pablo Nogués', 'Malvinas Argentinas', 40, ARRAY['1615']),
('Grand Bourg', 'Malvinas Argentinas', 42, ARRAY['1615']),
('Tortuguitas', 'Malvinas Argentinas', 45, ARRAY['1667']),
('Ing. Adolfo Sourdeaux', 'Malvinas Argentinas', 41, ARRAY['1613']),

-- JOSÉ C. PAZ (38-48 km)
('José C. Paz', 'José C. Paz', 42, ARRAY['1665']),
('Del Viso', 'José C. Paz', 48, ARRAY['1669']),

-- SAN MIGUEL (35-45 km)
('San Miguel', 'San Miguel', 38, ARRAY['1663']),
('Muñiz', 'San Miguel', 36, ARRAY['1663']),
('Bella Vista', 'San Miguel', 40, ARRAY['1661']),

-- ZÁRATE (85-95 km)
('Zárate', 'Zárate', 88, ARRAY['2800']),
('Lima', 'Zárate', 80, ARRAY['2805']),

-- CAMPANA (75-85 km)
('Campana', 'Campana', 78, ARRAY['2804']),

-- SAN NICOLÁS (220+ km)
('San Nicolás de los Arroyos', 'San Nicolás', 230, ARRAY['2900']),

-- LUJÁN (65-75 km)
('Luján', 'Luján', 68, ARRAY['6700']),
('Open Door', 'Luján', 65, ARRAY['6708']),
('Carlos Keen', 'Luján', 75, ARRAY['6706']),

-- GENERAL RODRÍGUEZ (55-65 km)
('General Rodríguez', 'General Rodríguez', 58, ARRAY['1748']),

-- MERCEDES (95-105 km)
('Mercedes', 'Mercedes', 100, ARRAY['6600']),

-- CHIVILCOY (155-165 km)
('Chivilcoy', 'Chivilcoy', 160, ARRAY['6620']),

-- JUNÍN (255-265 km)
('Junín', 'Junín', 260, ARRAY['6000']),

-- PERGAMINO (220-230 km)
('Pergamino', 'Pergamino', 225, ARRAY['2700']),

-- SAN PEDRO (165-175 km)
('San Pedro', 'San Pedro', 170, ARRAY['2930']),

-- CHASCOMÚS (110-120 km)
('Chascomús', 'Chascomús', 115, ARRAY['7130']),

-- DOLORES (190-200 km)
('Dolores', 'Dolores', 195, ARRAY['7100']),

-- MAR DEL PLATA (395-410 km)
('Mar del Plata', 'General Pueyrredón', 400, ARRAY['7600']),
('Batán', 'General Pueyrredón', 410, ARRAY['7601']),

-- NECOCHEA (520-540 km)
('Necochea', 'Necochea', 530, ARRAY['7630']),
('Quequén', 'Necochea', 532, ARRAY['7631']),

-- BAHÍA BLANCA (650-680 km)
('Bahía Blanca', 'Bahía Blanca', 670, ARRAY['8000']),
('Ingeniero White', 'Bahía Blanca', 675, ARRAY['8103']),

-- TANDIL (350-365 km)
('Tandil', 'Tandil', 360, ARRAY['7000']),

-- OLAVARRÍA (340-360 km)
('Olavarría', 'Olavarría', 350, ARRAY['7400']),

-- AZUL (290-310 km)
('Azul', 'Azul', 300, ARRAY['7300']),

-- BALCARCE (380-400 km)
('Balcarce', 'Balcarce', 390, ARRAY['7620']),

-- TRES ARROYOS (480-510 km)
('Tres Arroyos', 'Tres Arroyos', 500, ARRAY['7500']),

-- CORONEL SUÁREZ (520-550 km)
('Coronel Suárez', 'Coronel Suárez', 540, ARRAY['7540']),

-- LOBOS (95-110 km)
('Lobos', 'Lobos', 100, ARRAY['7240']),

-- CAÑUELAS (55-70 km)
('Cañuelas', 'Cañuelas', 60, ARRAY['1814']),
('Vicente Casares', 'Cañuelas', 58, ARRAY['1816']),
('Máximo Paz', 'Cañuelas', 65, ARRAY['1814']),

-- BRANDSEN (65-80 km)
('Brandsen', 'Brandsen', 70, ARRAY['1980']),
('Jeppener', 'Brandsen', 75, ARRAY['1981']),

-- SAN CAYETANO (490-520 km)
('San Cayetano', 'San Cayetano', 510, ARRAY['7521']),

-- CORONEL PRINGLES (460-490 km)
('Coronel Pringles', 'Coronel Pringles', 480, ARRAY['7530']),

-- GONZALES CHAVES (420-450 km)
('Adolfo Gonzales Chaves', 'Adolfo Gonzales Chaves', 440, ARRAY['7513']),

-- BENITO JUÁREZ (400-430 km)
('Benito Juárez', 'Benito Juárez', 420, ARRAY['7020']),

-- LAPRIDA (380-410 km)
('Laprida', 'Laprida', 400, ARRAY['7414']),

-- GENERAL ALVEAR (280-310 km)
('General Alvear', 'General Alvear', 295, ARRAY['7263']),

-- 25 DE MAYO (210-240 km)
('Veinticinco de Mayo', 'Veinticinco de Mayo', 225, ARRAY['6660']),

-- BOLÍVAR (300-330 km)
('San Carlos de Bolívar', 'Bolívar', 320, ARRAY['6550']),

-- PEHUAJÓ (360-390 km)
('Pehuajó', 'Pehuajó', 375, ARRAY['6450']),

-- TRENQUE LAUQUEN (430-460 km)
('Trenque Lauquen', 'Trenque Lauquen', 450, ARRAY['6400']),

-- LINCOLN (300-330 km)
('Lincoln', 'Lincoln', 315, ARRAY['6070']),

-- BRAGADO (200-230 km)
('Bragado', 'Bragado', 215, ARRAY['6640']),

-- 9 DE JULIO (250-280 km)
('9 de Julio', 'Nueve de Julio', 265, ARRAY['6500']),

-- CHACABUCO (190-220 km)
('Chacabuco', 'Chacabuco', 205, ARRAY['6740']),

-- RAMALLO (210-240 km)
('Ramallo', 'Ramallo', 225, ARRAY['2915']),

-- SAN ANTONIO DE ARECO (110-130 km)
('San Antonio de Areco', 'San Antonio de Areco', 115, ARRAY['2760']),

-- EXALTACIÓN DE LA CRUZ (70-85 km)
('Capilla del Señor', 'Exaltación de la Cruz', 75, ARRAY['2812']),
('Los Cardales', 'Exaltación de la Cruz', 72, ARRAY['1615']),

-- PINAMAR (340-360 km)
('Pinamar', 'Pinamar', 350, ARRAY['7167']),
('Ostende', 'Pinamar', 348, ARRAY['7166']),
('Valeria del Mar', 'Pinamar', 352, ARRAY['7167']),
('Cariló', 'Pinamar', 355, ARRAY['7167']),

-- VILLA GESELL (360-380 km)
('Villa Gesell', 'Villa Gesell', 370, ARRAY['7165']),
('Mar de las Pampas', 'Villa Gesell', 375, ARRAY['7165']),
('Las Gaviotas', 'Villa Gesell', 377, ARRAY['7165']),

-- MAR DE AJÓ (310-330 km)
('Mar de Ajó', 'La Costa', 320, ARRAY['7109']),
('San Clemente del Tuyú', 'La Costa', 300, ARRAY['7105']),
('Las Toninas', 'La Costa', 305, ARRAY['7106']),
('Santa Teresita', 'La Costa', 308, ARRAY['7107']),
('Mar del Tuyú', 'La Costa', 312, ARRAY['7108']),
('San Bernardo', 'La Costa', 325, ARRAY['7111']),

-- MIRAMAR (440-460 km)
('Miramar', 'General Alvarado', 450, ARRAY['7607']),

-- GENERAL MADARIAGA (310-340 km)
('General Madariaga', 'General Madariaga', 330, ARRAY['7163']),

-- PUNTA INDIO (90-110 km)
('Punta Indio', 'Punta Indio', 100, ARRAY['1917']),
('Verónica', 'Punta Indio', 95, ARRAY['1917']),

-- MAGDALENA (70-90 km)
('Magdalena', 'Magdalena', 80, ARRAY['1913']),

-- QUILMES - Más localidades
('Villa La Florida', 'Quilmes', 7, ARRAY['1878']),

-- LANÚS - Más localidades
('Villa Caraza', 'Lanús', 11, ARRAY['1824'])

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MODIFICACIONES A TABLA PUBLIC_QUOTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Agregar campo distance_km para guardar distancia calculada
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS distance_km DECIMAL(6,1);
COMMENT ON COLUMN public_quotes.distance_km IS 'Distancia en km desde Quilmes a la ciudad del cliente';

-- Agregar campo is_free_shipping
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS is_free_shipping BOOLEAN DEFAULT false;
COMMENT ON COLUMN public_quotes.is_free_shipping IS 'Si aplica envío gratis (distancia <= 60km)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMENTARIOS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE buenos_aires_cities IS 'Ciudades de Buenos Aires con distancias precalculadas desde Quilmes para determinar envío gratis';
COMMENT ON COLUMN buenos_aires_cities.distance_km IS 'Distancia aproximada en kilómetros desde Quilmes Centro';
COMMENT ON COLUMN buenos_aires_cities.is_free_shipping IS 'Campo generado: true si distance_km <= 60';
