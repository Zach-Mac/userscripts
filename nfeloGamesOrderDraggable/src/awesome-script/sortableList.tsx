import { createSignal, For, splitProps } from 'solid-js';

import { useDragDropContext } from '@thisbeyond/solid-dnd';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  closestCenter,
} from '@thisbeyond/solid-dnd';

export const Sortable = (props) => {
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
    >
      {props.item}
    </div>
  );
};

export const SortableVerticalList = (props) => {
  const [activeItem, setActiveItem] = createSignal(null);
  //   const ids = () => props.items;
  const ids = () => props.items.map((item, index) => index);

  const onDragStart = ({ draggable }) => setActiveItem(draggable.id);

  const onDragEnd = ({ draggable, droppable }) => {
    if (draggable && droppable) {
      const currentItems = ids();
      const fromIndex = currentItems.indexOf(draggable.id);
      const toIndex = currentItems.indexOf(droppable.id);
      if (fromIndex !== toIndex) {
        const updatedItems = currentItems.slice();
        updatedItems.splice(toIndex, 0, ...updatedItems.splice(fromIndex, 1));
        props.setItems(updatedItems);
      }
      props.afterDrag();
    }
  };

  //   const initItems = props.items;

  //   const [items, setItems] = createSignal(initItems);
  //   const [activeItem, setActiveItem] = createSignal(null);
  //   const ids = () => items();

  //   const onDragStart = ({ draggable }) => setActiveItem(draggable.id);

  //   const onDragEnd = ({ draggable, droppable }) => {
  //     if (draggable && droppable) {
  //       const currentItems = ids();
  //       const fromIndex = currentItems.indexOf(draggable.id);
  //       const toIndex = currentItems.indexOf(droppable.id);
  //       if (fromIndex !== toIndex) {
  //         const updatedItems = currentItems.slice();
  //         updatedItems.splice(toIndex, 0, ...updatedItems.splice(fromIndex, 1));
  //         setItems(updatedItems);
  //       }
  //     }
  //   };

  return (
    <div>
      {ids()}
      <DragDropProvider
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div class="column self-stretch">
          <SortableProvider ids={ids()}>
            <For each={props.items}>{(item) => <Sortable item={item} />}</For>
          </SortableProvider>
        </div>
        <DragOverlay>
          <div class="sortable">{activeItem()}</div>
        </DragOverlay>
      </DragDropProvider>
    </div>
  );
};
