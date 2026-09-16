# Agentic Instruments

Date: 2026-09-16

## Thesis

Sketchpad suggests a form of software that is larger than a coding tool.
It is a shared semantic workspace.
Humans and agents act on the same durable objects, relations, constraints, and
history.
Code is one possible material in that workspace.
It is not the whole workspace.

The central statement is:

> The next interface is not a conversation about work.  It is a shared world
> in which humans and machines can refer to, test, and transform the same
> things.

We call this system an **agentic instrument**.
It can also be called a **constraint-native agentic workstation**.

## What Lives in the Screen

Only pixels and light live in the physical screen.
The objects do not live inside those pixels.
They have canonical identities in a semantic kernel.
The screen gives those objects visible and spatial forms.

The screen is therefore a shared spatial index.
It is also an interaction surface.
A person can point at an object.
An agent can refer to the same object by its stable identity.
Both participants can inspect its state, relations, constraints, and history.
The phrase `this thing` can have an exact shared referent.

This differs from most current graphical interfaces.
Most current screens show separate projections of private application state.
The user moves information between those applications.
The proposed screen shows views of one addressable semantic world.

The visible form is not the source of truth.
It is a handle on the source of truth.
The system must not show a successful result unless the underlying object state
also changed.

## Shared Memory

The words `shared memory` are philosophical here.
They do not mean that a human mind and a model use the same physical RAM.
They mean that both participants work through one persistent referential plane.

Each object has these properties:

- A stable identity.
- A type.
- A current state.
- Relations to other objects.
- Constraints on valid states.
- Permissions for possible actions.
- Provenance for its claims and values.
- A history of changes.

The human sees a projection of this state.
The agent receives a structured projection of the same state.
Both act on the same object identities.
Both observe the same accepted changes.
The common state persists when either participant stops attending to it.

This is more than shared context in a chat transcript.
A transcript describes objects.
A shared semantic workspace contains addressable objects.

## The Objects of Today

The first useful object vocabulary is not specific to programming.
It includes these primitives:

- **Entity:** A durable thing with an identity.
- **Relation:** A typed connection between entities.
- **Constraint:** A condition that valid states must satisfy.
- **Claim:** A statement that can be supported or disputed.
- **Evidence:** A source, observation, or measurement for a claim.
- **Proposal:** A possible future state that is not yet committed.
- **Action:** An authorized transition between states.
- **Commitment:** A promised result, owner, and time.
- **Resource:** Time, money, compute, material, or attention.
- **Actor:** A person, agent, organization, or service.
- **Capability:** An action that an actor is allowed to perform.
- **Event:** An immutable record of a change or observation.
- **View:** A projection of objects for one task or participant.

Domain objects can build on these primitives.

- Software has repositories, symbols, interfaces, tests, processes,
  deployments, and incidents.
- Research has claims, sources, experiments, data sets, uncertainties, and
  contradictions.
- Business has customers, requests, contracts, invoices, promises, and risks.
- Design has components, requirements, measurements, materials, and
  dependencies.
- Personal work has people, messages, appointments, tasks, possessions, and
  decisions.
- Media has shots, scenes, performances, rights, edits, and timing.

These objects are not files.
A file can serialize an object.
A document can show a view of an object.
Neither form must own the object's identity.

## Operations on the Shared World

Humans and agents need a small set of common operations:

- Point and select.
- Pin a value or invariant.
- Relate two objects.
- Add or remove a constraint.
- Group and separate objects.
- Create a branch.
- Simulate a proposed change.
- Commit or reject a proposal.
- Revert a change.
- Delegate a bounded goal.
- Inspect a cause.
- Request evidence.
- Grant or remove a capability.
- Monitor an active process.

The interface can use a mouse, keyboard, pen, voice, or agent action.
The operation must still address the same canonical object.

## Why This Is Not a New Way to Write Code

Code is one object graph among many.
The larger goal is joint manipulation of a persistent causal model.
The model can contain software, people, money, physical parts, scientific
claims, and future commitments at the same time.

Text generation is not the main act.
The main act is a controlled state transition in the shared world.
An agent can propose, test, and transform that world.
A deterministic kernel decides what state actually exists.
Constraints reject invalid transitions.
Capabilities control effects outside the workspace.

The agent must not privately invent success.
The interface must not simulate semantic success.
The accepted object state is the common truth for the system.

## Lessons From Sketchpad

Sketchpad provides a concrete model for this design.

- The light pen joins perception and action on one surface.
- Geometric figures are objects instead of marks in a bitmap.
- Relations and constraints express intent above procedure.
- The constraint solver protects intent during later changes.
- The display shows the computer's state and also accepts human action.
- Temporary phosphor traces make active computation visible.
- The machine can reject a request that violates its rules.
- The program retains authorship of geometry while hardware supplies physical
  input and output.

The reconstruction added one more lesson.
Authenticity depends on a strict boundary.
Browser code can model hardware.
It must not secretly create the geometry that the assembly claims to create.
The same rule should apply to agentic systems.
The interface can mediate input and output.
It must not replace the semantic kernel with a convincing animation.

## Design Commitments

An agentic instrument should satisfy these commitments:

1. Humans and agents act on the same object identities.
2. Objects persist beyond one screen, prompt, session, or model.
3. Constraints state intent before procedures state steps.
4. Proposals remain visibly different from committed state.
5. External effects pass through explicit capabilities.
6. Every accepted change has an author, cause, and time.
7. Important changes are reversible when the domain permits reversal.
8. Agent attention and uncertainty have visible forms.
9. Tests exercise the real semantic runtime.
10. The interface does not claim changes that the runtime did not accept.
11. Direct manipulation stays local and low latency.
12. Multiple agents receive bounded roles in one consistent world.
13. The semantic kernel remains independent from any one model provider.

## A Possible Experience

A user sees a common canvas.
The canvas contains code, research claims, customers, contracts, budgets, and
running processes.
Each visible item is a view of a canonical object.

The user selects two objects and asks the system to make them agree.
The user pins the conditions that must remain true.
Several agents explore possible transitions.
Their proposals appear as temporary objects.
Validators test each proposal against the pinned constraints.
The user or an authorized policy accepts one proposal.
The kernel commits it.
The event journal records the cause and result.

Conversation can still exist.
It becomes one control channel among several.
It is not the only place where the work exists.

## System Layers

The design needs six separate layers:

1. The semantic kernel owns canonical object state.
2. Projections give objects visible, audible, or textual forms.
3. Interaction maps human and agent actions to object operations.
4. Constraint engines validate possible state transitions.
5. An event journal preserves provenance, replay, and branches.
6. Capability boundaries control effects in external systems.

These layers can use different technologies.
They must preserve stable identity across their boundaries.

## Open Research Questions

- How can domains compose object schemas without one universal schema?
- How should spatial position relate to semantic identity?
- How can constraints cross software, business, and physical domains?
- How should the interface show temporary agent attention?
- How can it show uncertainty without making the workspace noisy?
- How should several humans and agents resolve concurrent changes?
- How can provenance stay complete without becoming unusable?
- Which operations require human authority?
- Which state can remain local?
- Which state must be durable and shared?
- How can direct manipulation stay below the threshold of perceived latency?
- How should the system measure whether collaboration improved the real result?

The central research problem is now clear.
We must build a shared world with strict truth boundaries.
We must then make that world as immediate to manipulate as Sketchpad made
geometry.
