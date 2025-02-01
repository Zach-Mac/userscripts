import { createSignal, For } from 'solid-js';
import { render } from 'solid-js/web';
import { getPanel, showToast } from '@violentmonkey/ui';
import globalCss from './style.css';
import styles, { stylesheet } from './style.module.css';
import type { JSX } from 'solid-js';

const STORAGE_KEY = 'nfeloGamesOrder_clickedIndexes';
function loadFromStorage(): number[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}
function saveToStorage(indexes: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(indexes));
}
const [clickedIndexes, setClickedIndexes] = createSignal(loadFromStorage());

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
  const teamAwayLogo = (teamLogos[0] as HTMLImageElement).src;
  const teamHomeLogo = (teamLogos[1] as HTMLImageElement).src;

  return {
    teamAway,
    teamHome,
    teamAwayLogo,
    teamHomeLogo,
  };
});

const [items, setItems] = createSignal(gamesSanitized);
console.log('items()', items());

function sortGames(indexes: number[]) {
  const games = document.querySelectorAll(
    '[class^="games_box-module--game_box"]',
  );
  const gamesArray = Array.from(games);
  const gamesContainer = document.querySelector(
    '[class^="games_box-module--game_container"]',
  );
  gamesContainer.innerHTML = '';

  indexes.forEach((index) => {
    gamesContainer.appendChild(gamesArray[index]);
  });
}

const ulStyle: JSX.CSSProperties = {
  'list-style': 'none',
  padding: '0',
  margin: '0',
  display: 'grid',
  'grid-template-columns': '1fr 1fr',
  gap: '5px',
};
const liStyle: JSX.CSSProperties = {
  border: '1px solid #ccc',
  margin: '5px 0',
  'border-radius': '4px',
  'background-color': '#fff',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  position: 'relative',
};
const badgeStyle: JSX.CSSProperties = {
  position: 'absolute',
  top: '5px',
  right: '5px',
  'background-color': '#4CAF50',
  color: 'white',
  'border-radius': '50%',
  width: '20px',
  height: '20px',
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'center',
  'font-size': '12px',
};
const liDivStyle: JSX.CSSProperties = {
  display: 'flex',
  'align-items': 'center',
  padding: '8px',
};
const imgStyle: JSX.CSSProperties = {
  width: '24px',
  height: '24px',
  'margin-right': '8px',
};
const buttonStyle: JSX.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #ccc',
  'border-radius': '4px',
  'background-color': '#fff',
  cursor: 'pointer',
  'margin-right': '5px',
};

function clickedGame(index) {
  const newIndexes = [...clickedIndexes(), index];
  setClickedIndexes(newIndexes);
  saveToStorage(newIndexes);
  console.log('clickedGame', index);
  console.log('clickedIndexes', clickedIndexes());
  console.log(items().length, clickedIndexes().length);
  if (clickedIndexes().length === items().length) {
    sortGames(clickedIndexes());
    showToast('Games reordered');
  }
}

function isClicked(index: number) {
  return clickedIndexes().includes(index);
}
function getClickOrder(index: number): number {
  return clickedIndexes().indexOf(index) + 1;
}

const ListOfGames = () => (
  <ul style={ulStyle}>
    <For each={items()}>
      {(item, index) => (
        <li
          style={{
            ...liStyle,
            'background-color': isClicked(index()) ? '#e6ffe6' : '#fff',
            cursor: isClicked(index()) ? 'default' : 'pointer',
          }}
          onClick={() => !isClicked(index()) && clickedGame(index())}
        >
          {isClicked(index()) && (
            <div style={badgeStyle}>{getClickOrder(index())}</div>
          )}
          <div style={{ ...liDivStyle, 'border-bottom': '1px solid #ccc' }}>
            <img style={imgStyle} src={item.teamAwayLogo} />
            <span style={{ opacity: 0 }}>@&nbsp;</span>
            {item.teamAway}
          </div>

          <div style={liDivStyle}>
            <img style={imgStyle} src={item.teamHomeLogo} />
            <span>@&nbsp;</span>
            {item.teamHome}
          </div>
        </li>
      )}
    </For>
  </ul>
);

const [moveablePanel, setMoveablePanel] = createSignal(false);

// Create a movable panel using @violentmonkey/ui
const panel = getPanel({
  style: [globalCss, stylesheet].join('\n'),
});
Object.assign(panel.wrapper.style, {
  top: '5vh',
  left: '0vw',
});
panel.setMovable(moveablePanel());
// panel.show();

function togglePanelMoveable() {
  setMoveablePanel(!moveablePanel());
  panel.setMovable(moveablePanel());
}

const ClearButton = () => (
  <button
    style={buttonStyle}
    onClick={() => {
      setClickedIndexes([]);
      saveToStorage([]);
    }}
  >
    Clear
  </button>
);

const PanelContent = () => (
  <div>
    <button style={buttonStyle} onClick={togglePanelMoveable}>
      {!moveablePanel() ? 'Move' : 'Lock'} Panel
    </button>
    <button style={buttonStyle} onClick={() => panel.hide()}>
      Hide Panel
    </button>
    <ClearButton />
    <h1
      class="text-center"
      style={{ 'margin-top': '0px', 'margin-bottom': '5px' }}
    >
      Reorder games
    </h1>
    <ListOfGames />
  </div>
);
render(PanelContent, panel.body);

const buttons = () => (
  <div style={{ 'margin-left': '5px' }}>
    <button style={buttonStyle} onClick={() => panel.show()}>
      Show Panel
    </button>
    <button style={buttonStyle} onClick={() => sortGames(clickedIndexes())}>
      Order games
    </button>
    <ClearButton />
    Indexes: {clickedIndexes().toString()}
  </div>
);

const appContainer = document.createElement('div');

// Create observer to ensure appContainer stays in header
const headerObserver = new MutationObserver(() => {
  const header = document.querySelector(
    '[class^="header-module--constrainer"]',
  );
  if (header && !header.contains(appContainer)) {
    header.appendChild(appContainer);
  }
});

// Initial append
const header = document.querySelector('[class^="header-module--constrainer"]');
if (header) {
  header.appendChild(appContainer);
  // Start observing the header for changes
  headerObserver.observe(header, {
    childList: true,
    subtree: true,
  });
}

render(buttons, appContainer);
