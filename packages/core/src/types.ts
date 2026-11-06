// Human Data Lab çekirdek sözleşmeleri (rapor §12, §13, §16, §19, §23).
// Bu dosya Playwright'a, dosya sistemine veya uygulama ayrıntısına bağımlı değildir.

export const SCHEMA_VERSION = '0.1';

// ---------- Fixture (§16) ----------

export type ControlType = 'input-text' | 'textarea';
export type InputMethod = 'fill';
export type FixtureExpectation = 'must-accept' | 'must-reject' | 'unspecified';

export interface Provenance {
  kind: 'synthetic' | 'third-party';
  license: string;
  source?: string;
}

export interface Fixture {
  schemaVersion: string;
  id: string;
  value: string;
  properties: string[];
  applicableControls: ControlType[];
  inputMethod: InputMethod;
  defaultExpectation: FixtureExpectation;
  provenance: Provenance;
  notes?: string;
}

export interface Corpus {
  schemaVersion: string;
  id: string;
  version: string;
  description: string;
  fixtures: Fixture[];
}

// ---------- Akış sözleşmesi / policy (§13) ----------

export type AcceptanceRuleId = 'acceptance.must-accept.v1' | 'acceptance.must-reject.v1';
export type PreservationRuleId = 'text.exact.v1' | 'text.nfc.v1';
export type RuleId = AcceptanceRuleId | PreservationRuleId;
export type Boundary = 'authored' | 'injected' | 'submitted' | 'readback';
export type ReadbackPolicy =
  | { kind: 'first-independent-read' }
  | { kind: 'stable-read'; consecutive: number; intervalMs: number; budgetMs: number }
  | { kind: 'readiness-signal' };

export interface PreservationCheck {
  id: string;
  rule: PreservationRuleId;
  required: boolean;
  /** Karşılaştırmanın başlangıç ve bitiş gözlemi. Başlangıç sessizce ileri taşınmaz (§20). */
  boundary: [Boundary, Boundary];
}

export interface ExpectationBinding {
  /** Bu özellik ailelerinden birine sahip fixture'lara uygulanır; '*' hepsi. */
  properties: string[] | '*';
  expect: 'must-accept' | 'must-reject';
}

export interface FlowContract {
  schemaVersion: string;
  id: string;
  field: { id: string; control: ControlType };
  inputMethod: InputMethod;
  /** Hangi fixture ailesine hangi kabul beklentisi bağlanır. Eşleşmeyen fixture kapsam dışıdır. */
  expectations: ExpectationBinding[];
  /** Fixture kimliğine özgü beklenti (aile bağlamasını ezer). */
  fixtureExpectations?: Record<string, 'must-accept' | 'must-reject'>;
  preservation: PreservationCheck[];
  readback: ReadbackPolicy;
}

// ---------- Kimlik ve sahiplik (§19) ----------

export interface TrialIdentity {
  runId: string;
  /** Mantıksal fixture örneği. */
  caseId: string;
  /** Küçültme adayının kimliği. */
  candidateId: string;
  /** Her çalıştırmada farklı. */
  attemptId: string;
  fixtureKey: string;
}

export interface OwnedFixture {
  namespace: string;
  resourceIds: string[];
  allocationLogRef: string;
  /** Sırrın kendisi rapora girmez; yalnız referans. */
  cleanupSecretRef?: string;
}

// ---------- Gözlem (§11) ----------

export type ObservationStatus = 'observed' | 'not-observed' | 'not-supported';

export interface Observation {
  boundary: Boundary;
  status: ObservationStatus;
  value?: string;
  /** Gözlemin nasıl alındığı: 'fixture', 'dom-input', 'request-body', 'ui-detail', 'api' … */
  source?: string;
  at?: string;
  note?: string;
}

export type Observations = Partial<Record<Boundary, Observation>>;

// ---------- Sonuç modeli (§12, §23) ----------

export type Execution = 'completed' | 'error' | 'cancelled';
export type ApplicationOutcome = 'accepted' | 'rejected' | 'indeterminate';
export type AssertionStatus = 'passed' | 'failed' | 'not-run' | 'indeterminate';
export type CleanupStatus = 'verified' | 'failed' | 'pending' | 'not-needed';
export type Reproducibility = 'not-checked' | 'stable' | 'unstable' | 'inconclusive';
export type ErrorClass = 'configuration' | 'adapter' | 'target' | 'observation' | 'assertion' | 'cleanup' | 'artifact';

export type DifferenceClass =
  | 'none' | 'emptied' | 'normalization-form-changed' | 'trimmed' | 'nbsp-replaced' | 'whitespace-collapsed'
  | 'truncated' | 'marks-stripped' | 'replacement-characters' | 'case-changed' | 'compatibility-folded' | 'other';

export interface AssertionResult {
  id: string;
  rule: RuleId;
  status: AssertionStatus;
  required: boolean;
  boundary?: [Boundary, Boundary];
  expectedRef?: string;
  actualRef?: string;
  /** Ham (kod noktası) eşitlik; NFC geçse bile ham fark saklanır (A04). */
  rawEqual?: boolean;
  difference?: DifferenceClass;
  firstDifferenceAt?: number;
  reason?: string;
}

export interface TrialError {
  class: ErrorClass;
  phase: Phase;
  message: string;
}

export type Phase =
  | 'preflight' | 'prepare' | 'inject' | 'submit' | 'acceptance' | 'readFresh' | 'compare' | 'cleanup' | 'finalize';

export interface PhaseEvent {
  phase: Phase;
  event: 'start' | 'end' | 'error';
  at: string;
  errorClass?: ErrorClass;
  message?: string;
}

export interface TrialResult {
  schemaVersion: string;
  identity: TrialIdentity;
  fixtureId: string;
  expectation: 'must-accept' | 'must-reject';
  execution: Execution;
  applicationOutcome: ApplicationOutcome;
  /** Kabul sinyalinin kanıtı: recordId + kaynağı (HTTP 200 / toast tek başına kanıt değildir, §20). */
  acceptanceEvidence?: { recordId?: string; reason?: string; evidenceRef?: string };
  observations: Observations;
  /** stable-read gibi politikalarda ara okumalar da saklanır (§21). */
  readbackSamples?: Array<{ at: string; value?: string; status: ObservationStatus }>;
  assertions: AssertionResult[];
  cleanup: CleanupStatus;
  errors: TrialError[];
  events: PhaseEvent[];
  timings: Partial<Record<Phase, number>>;
}

export interface FindingSignature {
  adapterId: string;
  fieldId: string;
  boundary: [Boundary, Boundary];
  ruleId: RuleId;
  applicationOutcome: ApplicationOutcome;
  differenceClass: DifferenceClass | 'n/a';
}

export interface Finding {
  schemaVersion: string;
  id: string;
  fixtureId: string;
  signature: FindingSignature;
  original: { value: string; attemptIds: string[] };
  reproducibility: Reproducibility;
  attemptsObserved: number;
  attemptsReproduced: number;
  shrink?: ShrinkSummary;
  syntheticDemo: boolean;
}

export interface ShrinkSummary {
  status: 'not-attempted' | 'completed' | 'budget-exhausted' | 'stopped-unstable' | 'stopped-cleanup' | 'no-smaller-found';
  best: { value: string; candidateId: string; verifiedTrials: number };
  trialsUsed: number;
  elapsedMs: number;
  note: string;
}

export interface Budgets {
  trialTimeoutMs: number;
  cleanupTimeoutMs: number;
  reproduceTrials: number;
  shrinkMaxTrials: number;
  shrinkMaxMs: number;
  maxEvidenceBytes: number;
  workers: 1;
}

export const DEFAULT_BUDGETS: Budgets = {
  trialTimeoutMs: 30_000,
  cleanupTimeoutMs: 10_000,
  reproduceTrials: 3,
  shrinkMaxTrials: 60,
  shrinkMaxMs: 5 * 60_000,
  maxEvidenceBytes: 2 * 1024 * 1024,
  workers: 1,
};

export type RunStatus = 'complete' | 'incomplete';

export interface RunSummary {
  selected: number;
  applicable: number;
  outOfScope: Array<{ fixtureId: string; reason: string }>;
  executed: number;
  preservationChecked: number;
  accepted: number;
  rejected: number;
  indeterminate: number;
  executionErrors: number;
  requiredFailed: number;
  requiredNotRun: number;
  cleanup: Record<CleanupStatus, number>;
  findings: number;
}

export type ExitCode = 0 | 1 | 2 | 3 | 130;
