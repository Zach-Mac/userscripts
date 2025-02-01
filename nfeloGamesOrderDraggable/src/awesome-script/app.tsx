import { createSignal, For } from 'solid-js';
import { createStore } from './store';
import { render } from 'solid-js/web';
import { getPanel, showToast } from '@violentmonkey/ui';
import globalCss from './style.css';
import styles, { stylesheet } from './style.module.css';

import { useDragDropContext } from '@thisbeyond/solid-dnd';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  closestCenter,
} from '@thisbeyond/solid-dnd';

const [store, setStore] = createStore({});

const games = document.querySelectorAll(
  '[class^="games_box-module--game_box"]',
);
const gamesArray = Array.from(games);

const gamesSanitized = gamesArray.map((game, index) => {
  const teamNames = game.querySelectorAll(
    '[class^="games_box-module--team_name"]',
  );
  const teamAway = teamNames[0].textContent;
  const teamHome = teamNames[1].textContent;

  const teamLogos = game.querySelectorAll(
    '[class^="games_box-module--team_logo"]',
  );
  const teamAwayLogo = teamLogos[0];
  const teamHomeLogo = teamLogos[1];

  return teamAway + ' @ ' + teamHome;
});

const [items, setItems] = createSignal(gamesSanitized);
console.log('items()', items());

function moveGame(fromIndex, toIndex) {
  console.log('fromIndex', fromIndex);
  console.log('toIndex', toIndex);

  if (toIndex > fromIndex) {
    toIndex = toIndex + 1;
  }

  const games = document.querySelectorAll(
    '[class^="games_box-module--game_box"]',
  );
  const gamesArray = Array.from(games);
  const game = gamesArray[fromIndex];
  const gamesContainer = document.querySelector(
    '[class^="games_box-module--game_container"]',
  );
  gamesContainer.removeChild(game);
  gamesContainer.insertBefore(game, gamesArray[toIndex]);
}

function sortGames() {
  const games = document.querySelectorAll(
    '[class^="games_box-module--game_box"]',
  );
  const gamesArray = Array.from(games);
  const sortedGames = items().map((index) => gamesArray[index - 1]);
  const gamesContainer = document.querySelector(
    '[class^="games_box-module--game_container"]',
  );
  gamesContainer.innerHTML = '';
  sortedGames.forEach((game) => gamesContainer.appendChild(game));
}

const [moveablePanel, setMoveablePanel] = createSignal(false);

// Create a movable panel using @violentmonkey/ui
const panel = getPanel({
  style: [globalCss, stylesheet].join('\n'),
});
Object.assign(panel.wrapper.style, {
  top: '10vh',
  //   left: '80vw',
  left: '0vw',
  //   width: '20vw',
});
panel.setMovable(moveablePanel());
// panel.show();

function togglePanelMoveable() {
  setMoveablePanel(!moveablePanel());
  panel.setMovable(moveablePanel());
}

const Sortable = (props) => {
  const sortable = createSortable(props.item);
  const [state] = useDragDropContext();
  return (
    <div
      use:sortable
      class="sortable"
      classList={{
        'opacity-25': sortable.isActiveDraggable,
        'transition-transform': !!state.active.draggable,
      }}
      style={{
        border: '1px solid black',
        'text-align': 'center',
        padding: '10px',
        cursor: 'grab', // Add this line to change the cursor on hover
      }}
    >
      {props.item}
    </div>
  );
};
const SortableVerticalList = () => {
  const [activeItem, setActiveItem] = createSignal(null);
  const ids = () => items();

  const onDragStart = ({ draggable }) => setActiveItem(draggable.id);

  const onDragEnd = ({ draggable, droppable }) => {
    if (draggable && droppable) {
      const currentItems = ids();
      const fromIndex = currentItems.indexOf(draggable.id);
      const toIndex = currentItems.indexOf(droppable.id);
      if (fromIndex !== toIndex) {
        const updatedItems = currentItems.slice();
        updatedItems.splice(toIndex, 0, ...updatedItems.splice(fromIndex, 1));
        setItems(updatedItems);
        moveGame(fromIndex, toIndex);
      }
    }
  };

  return (
    <div>
      <DragDropProvider
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div class="column self-stretch">
          <SortableProvider ids={ids()}>
            <For each={items()}>{(item) => <Sortable item={item} />}</For>
          </SortableProvider>
        </div>
        <DragOverlay>
          <div class="sortable">{activeItem()}</div>
        </DragOverlay>
      </DragDropProvider>
    </div>
  );
};

const panelContent = () => (
  <div>
    <button onClick={togglePanelMoveable}>
      {!moveablePanel() ? 'Move' : 'Lock'} Panel
    </button>
    <button onClick={() => panel.hide()}>Hide Panel</button>
    <h1 class="text-center">Reorder games</h1>
    <SortableVerticalList />
  </div>
);

render(panelContent, panel.body);

const showPanel = () => (
  <button onClick={() => panel.show()}>Show Panel</button>
);

// render(() => <SortableVerticalList />, panel.body);
render(showPanel, document.body);
render(() => <SortableVerticalList />, document.body);
