import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Toolbox } from '../src/shell/Toolbox';
import moduleJson from '../src/modules/m1/module.json';

afterEach(() => cleanup());

const followMoves = moduleJson.followMoves; // the four accepted Stage-2 moves, from module.json
const cardTypes = moduleJson.cardTypes; // accepted labels — なぜ？/たとえば？/つまり？/ほかには？
const heading = moduleJson.ui.toolboxHeading;

describe('Toolbox (WO-05: 問いのどうぐばこ)', () => {
  it('gives all four accepted Stage-2 moves a stable representation, each showing its accepted label', () => {
    render(<Toolbox followMoves={followMoves} cardTypes={cardTypes} moveProgress={{}} heading={heading} />);
    expect(followMoves).toEqual(['follow-naze', 'follow-tatoeba', 'follow-tsumari', 'follow-hokaniwa']);
    for (const move of followMoves) {
      expect(screen.getByText(cardTypes[move as keyof typeof cardTypes]!.label)).toBeInTheDocument();
    }
  });

  it('renders every move as undiscovered when moveProgress is empty (new/legacy profile)', () => {
    render(<Toolbox followMoves={followMoves} cardTypes={cardTypes} moveProgress={{}} heading={heading} />);
    const tools = document.querySelectorAll('.toolbox__tool');
    expect(tools).toHaveLength(4);
    for (const tool of tools) expect(tool.className).toContain('toolbox__tool--undiscovered');
  });

  it('renders a move absent from moveProgress as undiscovered even when siblings have progressed', () => {
    render(
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={{ 'follow-naze': { rung: 'tsukaeru', aptUseDomains: ['日常', 'ことば', '社会とひと'] } }}
        heading={heading}
      />,
    );
    const naze = screen.getByText(cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    const tatoeba = screen.getByText(cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--usable');
    expect(tatoeba.className).toContain('toolbox__tool--undiscovered');
  });

  it('renders moratta and tsukaeru as visibly different growth states', () => {
    render(
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={{
          'follow-naze': { rung: 'moratta', aptUseDomains: ['日常'] },
          'follow-tatoeba': { rung: 'tsukaeru', aptUseDomains: ['日常', 'ことば', '社会とひと'] },
        }}
        heading={heading}
      />,
    );
    const naze = screen.getByText(cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    const tatoeba = screen.getByText(cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--obtained');
    expect(tatoeba.className).toContain('toolbox__tool--usable');
    expect(naze.className).not.toBe(tatoeba.className);
  });

  it('can represent hitoride and sotode without this ticket ever producing them', () => {
    render(
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={{
          'follow-naze': { rung: 'hitoride', aptUseDomains: ['日常', 'ことば', '社会とひと'] },
          'follow-tatoeba': { rung: 'sotode', aptUseDomains: ['日常', 'ことば', '社会とひと'] },
        }}
        heading={heading}
      />,
    );
    const naze = screen.getByText(cardTypes['follow-naze'].label).closest('.toolbox__tool')!;
    const tatoeba = screen.getByText(cardTypes['follow-tatoeba'].label).closest('.toolbox__tool')!;
    expect(naze.className).toContain('toolbox__tool--independent');
    expect(tatoeba.className).toContain('toolbox__tool--outside');
  });

  it('never renders a score, percentage, accuracy, ranking, time, or domain-count', () => {
    render(
      <Toolbox
        followMoves={followMoves}
        cardTypes={cardTypes}
        moveProgress={{ 'follow-naze': { rung: 'tsukaeru', aptUseDomains: ['日常', 'ことば', '社会とひと'] } }}
        heading={heading}
      />,
    );
    const text = document.querySelector('.toolbox')!.textContent ?? '';
    expect(text).not.toMatch(/\d\s*\/\s*\d/); // no "3/3"-style counter
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/点|スコア|正解率|ランキング|順位/);
  });

  it('handles a module with no follow moves (e.g. the m2-test/stage1-test fixtures) by rendering an empty toolbox', () => {
    render(<Toolbox followMoves={[]} cardTypes={{}} moveProgress={{}} heading={heading} />);
    expect(document.querySelectorAll('.toolbox__tool')).toHaveLength(0);
  });
});
