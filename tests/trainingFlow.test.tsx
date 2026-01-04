import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Training UI/UX Consolidation', () => {
  test('TrainingRun.tsx file exists (new implementation)', () => {
    const pagesDir = resolve('/workspaces/Armoria/src/pages');
    const files = readdirSync(pagesDir);
    const hasTrainingRun = files.some((f) => f === 'TrainingRun.tsx');
    assert.ok(hasTrainingRun, 'TrainingRun.tsx should exist with new implementation');
  });

  test('TrainingRun.tsx uses PrebattleLayout (code audit)', () => {
    const trainingRunPath = resolve('/workspaces/Armoria/src/pages/TrainingRun.tsx');
    const content = readFileSync(trainingRunPath, 'utf-8');
    assert.ok(
      content.includes('PrebattleLayout'),
      'TrainingRun.tsx should import and use PrebattleLayout'
    );
  });

  test('TrainingRun.tsx uses runTrainingBattle (deterministic)', () => {
    const trainingRunPath = resolve('/workspaces/Armoria/src/pages/TrainingRun.tsx');
    const content = readFileSync(trainingRunPath, 'utf-8');
    assert.ok(
      content.includes('runTrainingBattle'),
      'TrainingRun.tsx should use deterministic runTrainingBattle()'
    );
  });

  test('TrainingRun.tsx generates ephemeral UUID for matchId', () => {
    const trainingRunPath = resolve('/workspaces/Armoria/src/pages/TrainingRun.tsx');
    const content = readFileSync(trainingRunPath, 'utf-8');
    assert.ok(
      content.includes('crypto.randomUUID()'),
      'TrainingRun.tsx should generate ephemeral UUID for matchId'
    );
  });

  test('TrainingRun passes playArea into BattleTheater navigation state', () => {
    const trainingRunPath = resolve('/workspaces/Armoria/src/pages/TrainingRun.tsx');
    const content = readFileSync(trainingRunPath, 'utf-8');
    assert.ok(
      content.includes('playArea: module.playArea') || content.includes('playArea: module.playArea ?? null'),
      'TrainingRun.tsx should forward playArea to BattleTheater state for disabling tiles'
    );
  });

  test('PrebattleLayout.tsx file exists (shared component)', () => {
    const componentPath = resolve('/workspaces/Armoria/src/components/PrebattleLayout.tsx');
    try {
      const content = readFileSync(componentPath, 'utf-8');
      assert.ok(content.includes('export'), 'PrebattleLayout.tsx should export a component');
    } catch {
      assert.fail('PrebattleLayout.tsx should exist');
    }
  });

  test('PvpMatch.tsx uses PrebattleLayout for both phases', () => {
    const pvpMatchPath = resolve('/workspaces/Armoria/src/pages/PvpMatch.tsx');
    const content = readFileSync(pvpMatchPath, 'utf-8');
    assert.ok(
      content.includes('PrebattleLayout'),
      'PvpMatch.tsx should import and use PrebattleLayout'
    );
  });

  test('BattleTheater.tsx has training mode support', () => {
    const battleTheaterPath = resolve('/workspaces/Armoria/src/pages/BattleTheater.tsx');
    const content = readFileSync(battleTheaterPath, 'utf-8');
    assert.ok(
      content.includes("mode === 'training'"),
      'BattleTheater.tsx should check for training mode'
    );
    assert.ok(
      content.includes('trainingExitTo'),
      'BattleTheater.tsx should route back to trainingExitTo for training mode'
    );
    assert.ok(
      content.includes('disabledCells') && content.includes('playArea'),
      'BattleTheater.tsx should derive disabledCells from training playArea so tiles stay darkened'
    );
  });

  test('BattleTheater.tsx skips settlement for training matches', () => {
    const battleTheaterPath = resolve('/workspaces/Armoria/src/pages/BattleTheater.tsx');
    const content = readFileSync(battleTheaterPath, 'utf-8');
    assert.ok(
      content.includes('isTraining') && content.includes('completeMatch'),
      'BattleTheater.tsx should skip completeMatch() when isTraining'
    );
  });

  test('TrainingRun.css file is deleted', () => {
    const pagesDir = resolve('/workspaces/Armoria/src/pages');
    const files = readdirSync(pagesDir);
    const hasTrainingRunCss = files.some((f) => f === 'TrainingRun.css');
    assert.ok(!hasTrainingRunCss, 'TrainingRun.css should be deleted (legacy file removed)');
  });

  test('BoardView.tsx file is deleted', () => {
    const pagesDir = resolve('/workspaces/Armoria/src/pages');
    const files = readdirSync(pagesDir);
    const hasBoardView = files.some((f) => f === 'BoardView.tsx');
    assert.ok(!hasBoardView, 'BoardView.tsx should be deleted (legacy file removed)');
  });

  test('App.tsx routes training to TrainingRun', () => {
    const appPath = resolve('/workspaces/Armoria/src/App.tsx');
    const content = readFileSync(appPath, 'utf-8');
    assert.ok(
      content.includes('TrainingRun'),
      'App.tsx should import TrainingRun for /training route'
    );
  });

  test('AuthContext is exported from context module', () => {
    const contextPath = resolve('/workspaces/Armoria/src/context/AuthContext.tsx');
    const content = readFileSync(contextPath, 'utf-8');
    assert.ok(
      content.includes('export const AuthContext'),
      'AuthContext.tsx should export AuthContext for test providers'
    );
  });

  test('PlayerContext is exported from context module', () => {
    const contextPath = resolve('/workspaces/Armoria/src/context/PlayerContext.tsx');
    const content = readFileSync(contextPath, 'utf-8');
    assert.ok(
      content.includes('export const PlayerContext'),
      'PlayerContext.tsx should export PlayerContext for test providers'
    );
  });

  test('Training matches do not create Supabase records (ephemeral only)', () => {
    const trainingRunPath = resolve('/workspaces/Armoria/src/pages/TrainingRun.tsx');
    const content = readFileSync(trainingRunPath, 'utf-8');
    // Should NOT contain match insertion into Supabase
    const hasMatchInsert = content.includes("from('matches').insert");
    assert.ok(
      !hasMatchInsert,
      'TrainingRun should not create Supabase match records (ephemeral UUID only)'
    );
  });
});
