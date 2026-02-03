/**
 * API Dashboard: /api/public-quotes/[id]/convert
 * Convertir cotización pública a cliente (y opcionalmente cotización formal)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConvertPublicQuoteRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body: ConvertPublicQuoteRequest = await request.json();

    // Obtener la cotización pública
    const { data: publicQuote, error: fetchError } = await supabase
      .from('public_quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !publicQuote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que no esté ya convertida
    if (publicQuote.converted_to_client_id) {
      return NextResponse.json(
        { error: 'Esta cotización ya fue convertida a cliente' },
        { status: 400 }
      );
    }

    // Verificar si ya existe un cliente con el mismo CUIT o email
    let existingClient = null;
    if (publicQuote.requester_cuit) {
      const { data: clientByCuit } = await supabase
        .from('clients')
        .select('id, name')
        .eq('cuit', publicQuote.requester_cuit.replace(/\D/g, ''))
        .single();
      existingClient = clientByCuit;
    }

    if (!existingClient && publicQuote.requester_email) {
      const { data: clientByEmail } = await supabase
        .from('clients')
        .select('id, name')
        .eq('email', publicQuote.requester_email.toLowerCase())
        .single();
      existingClient = clientByEmail;
    }

    let clientId: string;

    if (existingClient) {
      // Usar cliente existente
      clientId = existingClient.id;
    } else {
      // Determinar source basado en el origen del lead
      const clientSource = publicQuote.source === 'whatsapp' ? 'whatsapp' : 'web';

      // Crear nuevo cliente
      const clientData = {
        name: body.name || publicQuote.requester_name,
        company: body.company || publicQuote.requester_company,
        cuit: (body.cuit || publicQuote.requester_cuit)?.replace(/\D/g, '') || null,
        tax_condition: body.tax_condition || publicQuote.requester_tax_condition || 'consumidor_final',
        email: (body.email || publicQuote.requester_email)?.toLowerCase() || null,
        phone: (body.phone || publicQuote.requester_phone)?.replace(/\D/g, ''),
        address: body.address || publicQuote.address,
        city: body.city || publicQuote.city,
        province: body.province || publicQuote.province || 'Buenos Aires',
        postal_code: body.postal_code || publicQuote.postal_code,
        source: clientSource,
        source_quote_id: id,
        created_from_ip: publicQuote.source_ip,
      };

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single();

      if (clientError) {
        console.error('Error creating client:', clientError);
        return NextResponse.json(
          { error: 'Error al crear el cliente' },
          { status: 500 }
        );
      }

      clientId = newClient.id;
    }

    // Actualizar cotización pública
    const updateData: Record<string, unknown> = {
      status: 'converted',
      converted_to_client_id: clientId,
      converted_at: new Date().toISOString(),
      converted_by: 'dashboard', // TODO: usar usuario autenticado
    };

    // Opcionalmente crear cotización formal
    if (body.create_quote) {
      console.log('Creating formal quote for client:', clientId);

      // Obtener configuración de precios
      const { data: pricingConfig, error: pricingError } = await supabase
        .from('pricing_config')
        .select('*')
        .eq('is_active', true)
        .order('valid_from', { ascending: false })
        .limit(1)
        .single();

      console.log('Pricing config:', { pricingConfig, pricingError });

      if (pricingConfig) {
        // Generar número de cotización
        const { data: quoteNumber, error: quoteNumberError } = await supabase
          .rpc('generate_quote_number');

        console.log('Generated quote number:', { quoteNumber, quoteNumberError });

        if (quoteNumberError) {
          console.error('Error generating quote number:', quoteNumberError);
        }

        // Crear cotización formal
        // Calcular valid_until como 30 días desde ahora
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30);

        const quoteData = {
          quote_number: quoteNumber,
          client_id: clientId,
          status: 'draft',
          channel: 'web',
          total_m2: publicQuote.total_sqm,
          price_per_m2: publicQuote.price_per_m2,
          subtotal: publicQuote.subtotal,
          has_printing: publicQuote.has_printing,
          printing_colors: publicQuote.printing_colors || 0,
          printing_cost: 0,
          has_existing_polymer: false,
          has_die_cut: false,
          die_cut_cost: 0,
          shipping_cost: 0,
          total: publicQuote.subtotal,
          production_days: publicQuote.estimated_days,
          notes: publicQuote.message,
          internal_notes: `Convertido desde cotización web QW-${String(publicQuote.quote_number).padStart(4, '0')}`,
          valid_until: validUntil.toISOString(),
        };

        console.log('Creating quote with data:', quoteData);

        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .insert(quoteData)
          .select()
          .single();

        console.log('Quote creation result:', { quote, quoteError });

        if (quoteError) {
          console.error('Error creating quote:', quoteError);
        }

        if (!quoteError && quote) {
          // Crear item de cotización
          const itemData = {
            quote_id: quote.id,
            length_mm: publicQuote.length_mm,
            width_mm: publicQuote.width_mm,
            height_mm: publicQuote.height_mm,
            unfolded_length_mm: publicQuote.sheet_length_mm,
            unfolded_width_mm: publicQuote.sheet_width_mm,
            m2_per_box: publicQuote.sqm_per_box,
            quantity: publicQuote.quantity,
            total_m2: publicQuote.total_sqm,
          };

          console.log('Creating quote item with data:', itemData);

          const { error: itemError } = await supabase
            .from('quote_items')
            .insert(itemData);

          if (itemError) {
            console.error('Error creating quote item:', itemError);
          }

          updateData.converted_to_quote_id = quote.id;
          console.log('Quote created successfully:', quote.id);
        }
      } else {
        console.error('No pricing config found');
      }
    }

    // Actualizar cotización pública
    const { error: updateError } = await supabase
      .from('public_quotes')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating public quote:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar la cotización' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      client_id: clientId,
      quote_id: updateData.converted_to_quote_id || null,
      existing_client: !!existingClient,
    });

  } catch (error) {
    console.error('Error in POST /api/public-quotes/[id]/convert:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
