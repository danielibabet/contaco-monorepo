'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Joyride, STATUS } from 'react-joyride';
import toast from 'react-hot-toast';

interface TourContextType {
  startTour: () => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

const dashboardSteps: any[] = [
  {
    target: 'body',
    content: '¡Bienvenido al Dashboard de Business Intelligence! Vamos a dar un rápido repaso a los indicadores clave.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.tour-step-ingresos',
    content: 'Aquí verás el total de ingresos facturados en el ejercicio seleccionado.',
  },
  {
    target: '.tour-step-gastos',
    content: 'Y aquí el total de gastos contabilizados.',
  },
  {
    target: '.tour-step-pendiente-cobro',
    content: 'Este es el importe de las facturas que has emitido pero que aún no te han pagado (Pendiente de Cobro).',
  },
  {
    target: '.tour-step-grafico',
    content: 'Este gráfico muestra la evolución mensual de tu facturación. Útil para identificar tendencias.',
  },
  {
    target: '.tour-step-salud',
    content: 'En la sección de Salud Financiera verás qué porcentaje de tus facturas ya están cobradas o pagadas. Un buen indicador de liquidez.',
  }
];

const migracionSteps: any[] = [
  {
    target: 'body',
    content: 'Bienvenido a la herramienta de migración masiva desde ContaPlus u otros sistemas basados en DBF.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.tour-step-dropzone',
    content: 'Para importar tus datos, primero debes tener una carpeta con los archivos DBF de tu programa anterior. Haz clic derecho sobre esa carpeta y selecciona "Comprimir en archivo ZIP" (o "Enviar a > Carpeta comprimida"). Luego, arrastra el archivo .ZIP generado aquí o haz clic para seleccionarlo.',
    placement: 'top',
  },
  {
    target: '.tour-step-dropzone',
    content: 'Una vez subido, el sistema procesará todos los apuntes en segundo plano. No te preocupes si tarda unos minutos, podrás seguir usando la aplicación mientras tanto.',
    placement: 'bottom',
  }
];

const asientosSteps: any[] = [
  {
    target: 'body',
    content: 'Desde aquí puedes registrar nuevos asientos manuales o con plantillas predefinidas.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'Introduce la cuenta, concepto, debe y haber. Los descuadres se marcarán en rojo automáticamente para evitar errores.',
    placement: 'center',
    disableBeacon: true,
  }
];

const diarioSteps: any[] = [
  {
    target: 'body',
    content: 'Consulta y filtra todos los asientos contabilizados en este ejercicio.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'Usa estos filtros para buscar por fecha, cuenta o concepto específico.',
    placement: 'center',
    disableBeacon: true,
  }
];

const subcuentasSteps: any[] = [
  {
    target: 'body',
    content: 'Gestiona el cuadro de cuentas de la empresa.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'Aquí puedes crear nuevas subcuentas a 8 dígitos o consultar sus saldos acumulados.',
    placement: 'center',
    disableBeacon: true,
  }
];

const mayorSteps: any[] = [
  {
    target: 'body',
    content: 'Revisa los movimientos detallados de una subcuenta específica.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'Selecciona una cuenta para ver su saldo inicial, movimientos del periodo y saldo final.',
    placement: 'center',
    disableBeacon: true,
  }
];

const conciliacionSteps: any[] = [
  {
    target: 'body',
    content: 'Importa tu extracto bancario Norma 43 y puntea los movimientos con tu contabilidad.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'A la izquierda verás los movimientos del banco y a la derecha tus apuntes contables para facilitar el cuadre.',
    placement: 'center',
    disableBeacon: true,
  }
];

const balancesSteps: any[] = [
  {
    target: 'body',
    content: 'Comprueba el cuadre general de la contabilidad.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: 'body',
    content: 'Puedes exportar este balance a PDF o Excel para su revisión.',
    placement: 'center',
    disableBeacon: true,
  }
];

const situacionSteps: any[] = [
  {
    target: 'body',
    content: 'Visualiza la estructura de Activo, Pasivo y Patrimonio Neto de la empresa.',
    placement: 'center',
    disableBeacon: true,
  }
];

const pygSteps: any[] = [
  {
    target: 'body',
    content: 'Consulta el resultado del ejercicio (ingresos frente a gastos).',
    placement: 'center',
    disableBeacon: true,
  }
];

const modelosSteps: any[] = [
  {
    target: 'body',
    content: 'Genera automáticamente los borradores de tus impuestos (IVA 303, Resumen 390, Operaciones 347).',
    placement: 'center',
    disableBeacon: true,
  }
];

const facturasSteps: any[] = [
  {
    target: 'body',
    content: 'Emite facturas de venta o registra las facturas recibidas de proveedores.',
    placement: 'center',
    disableBeacon: true,
  }
];

const activosSteps: any[] = [
  {
    target: 'body',
    content: 'Da de alta los bienes de inversión y genera sus cuadros de amortización automáticamente.',
    placement: 'center',
    disableBeacon: true,
  }
];

const cierreSteps: any[] = [
  {
    target: 'body',
    content: 'Ejecuta los procesos de regularización (grupos 6 y 7) y el asiento de cierre.',
    placement: 'center',
    disableBeacon: true,
  }
];

const empresasSteps: any[] = [
  {
    target: 'body',
    content: 'Configura los datos fiscales de tus empresas y cambia de un ejercicio a otro.',
    placement: 'center',
    disableBeacon: true,
  }
];

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    setRun(false);
  }, [pathname]);

  const startTour = () => {
    let currentSteps: any[] = [];
    if (pathname === '/') currentSteps = dashboardSteps;
    else if (pathname === '/migracion') currentSteps = migracionSteps;
    else if (pathname === '/asientos') currentSteps = asientosSteps;
    else if (pathname === '/diario') currentSteps = diarioSteps;
    else if (pathname === '/subcuentas') currentSteps = subcuentasSteps;
    else if (pathname === '/mayor') currentSteps = mayorSteps;
    else if (pathname === '/conciliacion') currentSteps = conciliacionSteps;
    else if (pathname === '/balances') currentSteps = balancesSteps;
    else if (pathname === '/situacion') currentSteps = situacionSteps;
    else if (pathname === '/pyg') currentSteps = pygSteps;
    else if (pathname === '/modelos') currentSteps = modelosSteps;
    else if (pathname === '/facturas') currentSteps = facturasSteps;
    else if (pathname === '/activos') currentSteps = activosSteps;
    else if (pathname === '/cierre') currentSteps = cierreSteps;
    else if (pathname === '/empresas') currentSteps = empresasSteps;

    if (currentSteps.length > 0) {
      setSteps(currentSteps);
      setRun(true);
    } else {
      toast('No hay un tutorial disponible para esta pantalla.', { icon: 'ℹ️' });
    }
  };

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      setRun(false);
    }
  };

  const JoyrideComponent = Joyride as any;

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      <JoyrideComponent
        steps={steps}
        run={run}
        callback={handleJoyrideCallback}
        continuous
        showProgress
        showSkipButton
        locale={{
          back: 'Atrás',
          close: 'Cerrar',
          last: 'Finalizar',
          next: 'Siguiente',
          skip: 'Saltar',
        }}
        styles={{
          options: {
            primaryColor: '#4f46e5',
            zIndex: 10000,
          },
        }}
      />
    </TourContext.Provider>
  );
}
