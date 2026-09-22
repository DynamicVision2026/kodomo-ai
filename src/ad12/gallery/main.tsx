import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Mission, ModuleUiStrings } from '../../engine/types';
import { AnswerPlane } from '../AnswerPlane';
import { JudgeBar } from '../JudgeBar';
import { SlipCascade } from '../SlipCascade';
import { MoveTray } from '../MoveTray';
import { MoveCard } from '../MoveCard';
import { VoicePlane } from '../VoicePlane';
import { RefrainSlot } from '../RefrainSlot';
import { DepthRow } from '../DepthRow';
import { RootPlane } from '../RootPlane';
import { rootFormFor } from '../rootForm';
import { TeachBackPanel } from '../TeachBackPanel';
import { HomePlane } from '../HomePlane';
import { BankPlane, type BankItem } from '../BankPlane';
import { BreakthroughScene } from '../BreakthroughScene';
import { FieldStage, type FieldTone } from '../FieldStage';
import '../tokens.css';
import './gallery.css';

import chantoJson from '../../modules/m1/topics/chanto/s2.json';
import minnaJson from '../../modules/m1/topics/minna/s2.json';
import zuruiJson from '../../modules/m1/topics/zurui/s2.json';
import bankEscalatorJson from '../../modules/m1/topics/bank-escalator/s2.json';
import bankAtodeJson from '../../modules/m1/topics/bank-atode/s2.json';
import moduleJson from '../../modules/m1/module.json';

// Real content only — every string below is read directly off real mission/module JSON, never
// invented for this gallery (AD-12 §4's own instruction: "Visual state reads engine state").
const ui = moduleJson.ui as ModuleUiStrings;
const chanto = chantoJson as unknown as Mission;
const minna = minnaJson as unknown as Mission;
const zurui = zuruiJson as unknown as Mission;

const chantoDig = chanto.phases.find((p) => p.template === 'dig')! as Extract<Mission['phases'][number], { template: 'dig' }>;
const layer0 = chantoDig.layers[0]!;

function BreakthroughDemo({ total, planeText }: { total: number; planeText: string }) {
  const [current, setCurrent] = useState(2);
  const atRoot = current >= total;
  const tone: FieldTone = atRoot ? 'deep' : (Math.min(current - 1, 2) as 0 | 1 | 2);
  return (
    <div className="gallery-column">
      <BreakthroughScene tone={tone} total={total} current={current} rootReached={atRoot} planeText={planeText} />
      <button
        type="button"
        className="gallery-trigger"
        disabled={atRoot}
        onClick={() => setCurrent((c) => Math.min(c + 1, total))}
      >
        Trigger breakthrough (demo only — real progression is always engine-driven)
      </button>
    </div>
  );
}

function BankUnlockDemo({ items }: { items: BankItem[] }) {
  const [locked, setLocked] = useState(true);
  return (
    <div className="gallery-column">
      <BankPlane sectionLocked={locked} items={items} />
      <button type="button" className="gallery-trigger" disabled={!locked} onClick={() => setLocked(false)}>
        Simulate Story 1-4 complete (demo only — real unlock is engine-driven)
      </button>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="gallery-section" data-ad12-state={n}>
      <h2 className="gallery-section__label">{n}. {title}</h2>
      <div className="gallery-section__stage">{children}</div>
    </section>
  );
}

function Gallery() {
  return (
    <div className="ad12 gallery">
      <Section n={1} title="Answer at rest — SHOW / NUDGE / FADE">
        <FieldStage tone={0}>
          <div className="gallery-row">
            <AnswerPlane text={layer0.robotSays} guidanceLevel="show" readOnLabel={ui.handoffContinue} />
            <AnswerPlane text={layer0.robotSays} guidanceLevel="nudge" readOnLabel={ui.handoffContinue} />
            <AnswerPlane text={layer0.robotSays} guidanceLevel="fade" readOnLabel={ui.handoffContinue} />
          </div>
        </FieldStage>
      </Section>

      <Section n={2} title="Lid open, slip cascade settled (equal weight)">
        <FieldStage tone={1}>
          <SlipCascade
            slips={[
              { id: 'target', text: layer0.gap! },
              { id: 'd0', text: layer0.gapDistractors![0].text },
              { id: 'd1', text: layer0.gapDistractors![1].text },
            ]}
          />
        </FieldStage>
      </Section>

      <Section n={3} title="Gap chosen, tray at rest (equal cards, full text)">
        <FieldStage tone={1}>
          <MoveTray
            guidanceLevel="nudge"
            cards={layer0.hand.map((c) => ({ id: c.id, text: c.text }))}
          />
        </FieldStage>
      </Section>

      <Section n={4} title="Card pressed → magnified → committed">
        <FieldStage tone={1}>
          <div className="gallery-column">
            <div className="gallery-row">
              <MoveCard text={layer0.hand[0]!.text} variant="rest" />
              <MoveCard text={layer0.hand[0]!.text} variant="pressed" />
              <MoveCard text={layer0.hand[0]!.text} variant="magnified" />
              <MoveCard text={layer0.hand[0]!.text} variant="committed" />
            </div>
            <p className="gallery-caption">Live (press and release inside to commit; drag off to cancel):</p>
            <MoveCard text={layer0.hand[0]!.text} />
          </div>
        </FieldStage>
      </Section>

      <Section n={5} title="Miss reply, and the card's return">
        <FieldStage tone={1}>
          <div className="gallery-column">
            <VoicePlane speaker="ROBOT" speakerLabel={ui.stageRobotName} variant="flatReply" text={layer0.replies.offtopic!} />
            <MoveTray
              guidanceLevel="independent"
              cards={layer0.hand.map((c) => ({ id: c.id, text: c.text }))}
            />
          </div>
        </FieldStage>
      </Section>

      <Section n={6} title="Breakthrough mid-transition and after (deeper field, tab, chip, bar)">
        <FieldStage tone={1}>
          <div className="gallery-column">
            <BreakthroughDemo total={chantoDig.layers.length + 1} planeText={layer0.robotSays} />
            <p className="gallery-caption">Judge bar (live):</p>
            <JudgeBar gotItLabel={ui.earlyOk} notEnoughLabel={ui.judgeNotEnough} />
          </div>
        </FieldStage>
      </Section>

      <Section n={7} title="Early 'got it' with the challenger's challenge">
        <FieldStage tone={0}>
          <div className="gallery-column">
            <JudgeBar gotItLabel={ui.earlyOk} notEnoughLabel={ui.judgeNotEnough} pressed="gotIt" />
            <VoicePlane speaker="PONTA" speakerLabel={layer0.earlyOk!.challenger} variant="challenge" text={layer0.earlyOk!.asks} />
          </div>
        </FieldStage>
      </Section>

      <Section n={8} title="Root x3 — the three authored rootType forms">
        <FieldStage tone="deep">
          <div className="gallery-row">
            <RootPlane text={chantoDig.root.robotSays} form={rootFormFor(chanto.rootType)!} />
            <RootPlane
              text={(zurui.phases.find((p) => p.template === 'dig')! as Extract<Mission['phases'][number], { template: 'dig' }>).root.robotSays}
              form={rootFormFor(zurui.rootType)!}
            />
            <RootPlane
              text={(minna.phases.find((p) => p.template === 'dig')! as Extract<Mission['phases'][number], { template: 'dig' }>).root.robotSays}
              form={rootFormFor(minna.rootType)!}
            />
          </div>
        </FieldStage>
      </Section>

      <Section n={9} title="Listening: speaker plane · recall pull-forward · R1/R2/R3 refrains">
        <FieldStage tone="deep">
          <div className="gallery-column">
            {/* VoicePlane's speakerLabel is caller-supplied and content-agnostic (see
                VoicePlane.tsx) — no authored, reviewed Japanese display name exists yet for the
                GUIDE voice (module.json's own ui strings have one for ROBOT, stageRobotName,
                and ポン太 is already real authored data below, but not for GUIDE). Rather than
                invent Japanese copy, this fixture uses the plain English word as an explicit
                placeholder; a real label is a content decision for whoever authors the audio
                reference scripts, not something this component should guess. */}
            <VoicePlane speaker="GUIDE" speakerLabel="GUIDE" text={layer0.robotSays} />
            <VoicePlane speaker="PONTA" speakerLabel={layer0.earlyOk!.challenger} text={layer0.gap!} variant="refrain" />
            <p className="gallery-caption">R1 (1-1〜1-3): no slots.</p>
            <div className="gallery-row">
              <RefrainSlot />
              <RefrainSlot text={layer0.gap} />
            </div>
            <p className="gallery-caption">R2: guide begins, listener completes, slots as above. R3: the challenger's own plane speaks it.</p>
            <VoicePlane speaker="PONTA" speakerLabel={layer0.earlyOk!.challenger} text={layer0.gap!} variant="refrain" />
          </div>
        </FieldStage>
      </Section>

      <Section n={10} title="Teach-back and M2b parent confirmation (ink controls)">
        <FieldStage tone={0}>
          <div className="gallery-row">
            <TeachBackPanel
              teachBack={chanto.teachBack}
              ouchiTalk={chanto.ouchiTalk}
              m2ConfirmPrompt={ui.m2ConfirmPrompt}
              m2ConfirmAction={ui.m2ConfirmAction}
              m2Confirmed={false}
              m2ConfirmedMessage={ui.m2ConfirmedMessage}
            />
            <TeachBackPanel
              teachBack={chanto.teachBack}
              ouchiTalk={chanto.ouchiTalk}
              m2ConfirmPrompt={ui.m2ConfirmPrompt}
              m2ConfirmAction={ui.m2ConfirmAction}
              m2Confirmed
              m2ConfirmedMessage={ui.m2ConfirmedMessage}
            />
          </div>
        </FieldStage>
      </Section>

      <Section n={11} title="Home, Bank locked -> open (2nd-tier Bank digs after Story 5)">
        <FieldStage tone={0}>
          <div className="gallery-column">
            <div className="gallery-row">
              <HomePlane title={chanto.title} done depthTotal={chantoDig.layers.length + 1} />
              <HomePlane title={minna.title} done={false} />
            </div>
            <p className="gallery-caption">Bank — locked (before Story 1-4):</p>
            <BankPlane sectionLocked items={[]} />
            <p className="gallery-caption">Bank — open (めあて digs available; わかれ digs wait for Story 1-5):</p>
            <BankPlane
              sectionLocked={false}
              items={[
                { id: bankEscalatorJson.id, title: (bankEscalatorJson as unknown as Mission).title, available: true },
                { id: bankAtodeJson.id, title: (bankAtodeJson as unknown as Mission).title, available: false },
              ]}
            />
            <p className="gallery-caption">Bank — live unlock:</p>
            <BankUnlockDemo
              items={[
                { id: bankEscalatorJson.id, title: (bankEscalatorJson as unknown as Mission).title, available: true },
                { id: bankAtodeJson.id, title: (bankAtodeJson as unknown as Mission).title, available: false },
              ]}
            />
          </div>
        </FieldStage>
      </Section>

      <Section n={12} title="Reduced-motion variants of states 2 and 6">
        {/* Pass 1 has no motion at all yet, so under prefers-reduced-motion these render
            IDENTICALLY to states 2/6 above — that is the correct Pass 1 answer, not an
            oversight: there is nothing to reduce until Pass 2 adds real transitions. This
            section exists so Pass 2's reduced-motion crossfades (F8) have an established
            baseline screenshot to diff against once real motion exists. */}
        <div className="gallery-column" data-reduced-motion="true">
          <FieldStage tone={1}>
            <SlipCascade
              slips={[
                { id: 'target', text: layer0.gap! },
                { id: 'd0', text: layer0.gapDistractors![0].text },
                { id: 'd1', text: layer0.gapDistractors![1].text },
              ]}
            />
          </FieldStage>
          <FieldStage tone={1}>
            <DepthRow total={chantoDig.layers.length + 1} current={2} rootReached={false} />
          </FieldStage>
        </div>
      </Section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
