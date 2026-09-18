// App entry (/play).
// This is a minimal dev harness that sequences mission 1-1's phases so the Task 2/3/4
// templates (dig, slot-assembly, prediction-battle, handoff) can be played end to end. The
// real mission shell — profiles, hasAccess, wrapper screens (きょうのコツ / teach-back /
// おうちトーク), phase sequencing for every mission — is Task 5 (docs/work-order-w1.md) and
// will replace this file's App.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DigPhase, SlotAssemblyPhase } from './engine/types';
import { resolveSlotAssemblyPredictionOptions } from './engine/predictions';
import { SlotAssembly } from './templates/slot-assembly';
import { Dig } from './templates/dig';
import { PredictionBattle } from './templates/prediction-battle';
import { Handoff } from './templates/handoff';
import { Ruby } from './engine/ruby';
import { track } from './engine/analytics';
import mission from './modules/m1/topics/bread/s2.json';
import moduleJson from './modules/m1/module.json';

const slotPhase = mission.phases[0] as unknown as SlotAssemblyPhase;
const digPhase = mission.phases[1] as unknown as DigPhase;
const predictionOptions = resolveSlotAssemblyPredictionOptions(slotPhase, slotPhase.predictions![0]!);

type Step = 'predict' | 'slot' | 'dig' | 'handoff' | 'done';

function App() {
  const [step, setStep] = useState<Step>('predict');

  if (step === 'predict') {
    return (
      <PredictionBattle
        options={predictionOptions}
        skipLabel={moduleJson.ui.predictionSkip}
        handoffPrompt={moduleJson.ui.handoffPrompt}
        handoffContinueLabel={moduleJson.ui.handoffContinue}
        handoffSkipLabel={moduleJson.ui.handoffSkip}
        onComplete={() => setStep('slot')}
      />
    );
  }
  if (step === 'slot') {
    return <SlotAssembly phase={slotPhase} onComplete={() => setStep('dig')} />;
  }
  if (step === 'dig') {
    return (
      <Dig
        phase={digPhase}
        earlyOkLabel={moduleJson.ui.earlyOk}
        onComplete={() => setStep('handoff')}
      />
    );
  }
  if (step === 'handoff') {
    // Demonstrates Handoff's own reuse outside prediction-battle — spec v0.5 §5 step 9:
    // the mission hands off to the parent screen once the child's part is done.
    return (
      <Handoff
        prompt={moduleJson.ui.handoffPrompt}
        continueLabel={moduleJson.ui.handoffContinue}
        skipLabel={moduleJson.ui.handoffSkip}
        onContinue={() => {
          track('m1_complete');
          setStep('done');
        }}
        onSkip={() => {
          track('m1_complete');
          setStep('done');
        }}
      />
    );
  }
  return (
    <p className="mission-done">
      <Ruby text={mission.tip} />
    </p>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
