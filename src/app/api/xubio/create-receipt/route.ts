import { NextRequest, NextResponse } from 'next/server';
import { createDepositReceipt, createBalanceReceipt } from '@/lib/xubio';
import { isXubioEnabled } from '@/lib/config/system';
import type { PaymentMethod } from '@/lib/types/database';

// POST /api/xubio/create-receipt - Crear recibo en Xubio
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      order_id,
      type,
      method,
      amount,
      check_bank,
      check_number,
      check_date,
      check_holder,
      check_cuit,
    } = body;

    if (!order_id || !type || !method || !amount) {
      return NextResponse.json(
        { error: 'Se requieren order_id, type, method y amount' },
        { status: 400 }
      );
    }

    if (!['deposit', 'balance'].includes(type)) {
      return NextResponse.json(
        { error: 'type debe ser deposit o balance' },
        { status: 400 }
      );
    }

    const enabled = await isXubioEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'Xubio no está habilitado' },
        { status: 400 }
      );
    }

    // Datos del cheque si corresponde
    const checkData = (method === 'cheque' || method === 'echeq')
      ? { bank: check_bank, number: check_number, date: check_date, holder: check_holder, cuit: check_cuit }
      : undefined;

    const receipt = type === 'deposit'
      ? await createDepositReceipt(order_id, method as PaymentMethod, amount, checkData)
      : await createBalanceReceipt(order_id, method as PaymentMethod, amount, checkData);

    return NextResponse.json({
      success: true,
      receipt: {
        id: receipt.id,
        numero: receipt.numero,
        monto: receipt.monto,
      },
    });
  } catch (error) {
    console.error('Error creando recibo:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
