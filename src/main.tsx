// App entry (/play).
// This is a minimal dev harness that sequences mission 1-1's two phases so the Task 2/3
// templates (dig, slot-assembly) can be played end to end. The real mission shell — profiles,
// hasAccess, wrapper screens (きょうのコツ / teach-back / おうちトーク), phase sequencing for
// every mission — is Task 5 (docs/work-order-w1.md) and will replace this file's App.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DigPhase, SlotAssemblyPhase } from './engine/types';
import { SlotAssembly } from './templates/slot-assembly';
import { Dig } from './templates/dig';
import { Ruby } from './engine/ruby';
import { track } from './engine/analytics';
import mission from './modules/m1/topics/bread/s2.json';
import moduleJson from './modules/m1/module.json';

const slotPhase = mission.phases[0] as unknown as SlotAssemblyPhase;
const digPhase = mission.phases[1] as unknown as DigPhase;

function App() {
  const [step, setStep] = useState<'slot' | 'dig' | 'done'>('slot');

  if (step === 'done') {
    return <p className="mission-done"><Ruby text={mission.tip} /></p>;
  }
  if (step === 'dig') {
    return (
      <Dig
        phase={digPhase}
        earlyOkLabel={moduleJson.ui.earlyOk}
        onComplete={() => {
          track('m1_complete');
          setStep('done');
        }}
      />
    );
  }
  return (
    <SlotAssembly
      phase={slotPhase}
      onComplete={() => setStep('dig')}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
