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
    content: 'Para importar tus datos, primero debes comprimir tus archivos DBF en un archivo .ZIP. Luego, arrastra el .ZIP aquí o haz clic para seleccionarlo.',
    placement: 'top',
  },
  {
    target: '.tour-step-dropzone',
    content: 'Una vez subido, el sistema procesará los miles de apuntes en segundo plano usando AWS SQS. No te preocupes si tarda unos minutos, podrás seguir usando la aplicación mientras tanto.',
    placement: 'bottom',
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
    if (pathname === '/') {
      currentSteps = dashboardSteps;
    } else if (pathname === '/migracion') {
      currentSteps = migracionSteps;
    }

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
