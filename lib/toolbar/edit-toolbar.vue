<style lang="sass">
  @import '../../styleguide/toolbar';
  @import '../../styleguide/colors';
  @import '../../styleguide/layers';

  body {
    @include toolbar-padding();
  }

  .kiln-wrapper {
    @include toolbar-wrapper();

    .ui-snackbar-container {
      @include confirm-layer();

      bottom: 0;
      position: fixed;
    }

    .alert-container {
      pointer-events: none;

      & > * {
        pointer-events: all;
      }
    }
  }

  .kiln-progress {
    height: 3px;
    left: 0;
    position: relative;
    top: 0;
    width: 100%;
  }

  .toolbar-action-menu.ui-icon-button {
    display: inline-flex;

    @media screen and (min-width: 600px) {
      display: none;
    }
  }

  .toolbar-action-button.ui-icon-button {
    display: none;

    &.is-open-drawer {
      background-color: rgba(0, 0, 0, 0.3);
    }

    @media screen and (min-width: 600px) {
      display: inline-flex;
    }
  }

  .toolbar-publish-button.is-open-drawer {
    background-color: rgba(0, 0, 0, 0.3);
  }

  .toolbar-button-text {
    font-weight: bold;
  }
</style>

<template>
  <div class="kiln-wrapper">
    <alert-container></alert-container>
    <drawer></drawer>
    <ui-toolbar type="colored" text-color="white" @nav-icon-click="openNav">
      <ui-button type="primary" color="primary" size="large" :icon="statusIcon" has-dropdown ref="modeToggle">
        <span class="toolbar-button-text">{{ status }}</span>
        <ui-menu slot="dropdown" :options="toggleOptions" has-icons @select="toggleEditMode"></ui-menu>
      </ui-button>

      <div class="kiln-toolbar-actions" slot="actions">
        <!-- always display custom buttons -->
        <component v-for="(button, index) in customButtons" :is="button" :key="index"></component>
        <!-- display a dropdown menu of actions on smaller screens (viewport < 600px) -->
        <ui-icon-button class="toolbar-action-menu" color="white" size="large" type="secondary" icon="more_vert" tooltip="Actions" has-dropdown ref="dropdownButton" @click="closeDrawer">
          <ui-menu contain-focus has-icons slot="dropdown" :options="toolbarOptions" @close="$refs.dropdownButton.closeDropdown()" @select="toggleDrawerFromMenu"></ui-menu>
        </ui-icon-button>
        <!-- display individual buttons on larger screens (viewport >= 600px) -->
        <ui-icon-button class="toolbar-action-button" :disabled="!undoEnabled" color="white" size="large" type="secondary" icon="undo" tooltip="Undo" @click="undo"></ui-icon-button>
        <ui-icon-button class="toolbar-action-button" :disabled="!redoEnabled" color="white" size="large" type="secondary" icon="redo" tooltip="Redo" @click="redo"></ui-icon-button>
        <ui-icon-button v-if="isPageEditMode" class="toolbar-action-button" :class="{ 'is-open-drawer': currentDrawer === 'contributors' }" color="white" size="large" type="secondary" icon="people" tooltip="Contributors" @click.stop="toggleDrawer('contributors')"></ui-icon-button>
        <ui-icon-button v-if="!isPageEditMode" class="toolbar-action-button" :class="{ 'is-open-drawer': currentDrawer === 'layout-history' }" color="white" size="large" type="secondary" icon="people" tooltip="Layout History" @click.stop="toggleDrawer('layout-history')"></ui-icon-button>
        <ui-icon-button class="toolbar-action-button" :class="{ 'is-open-drawer': currentDrawer === 'components' }" color="white" size="large" type="secondary" icon="find_in_page" :tooltip="componentsTooltip" @click.stop="toggleDrawer('components')"></ui-icon-button>
        <ui-icon-button class="toolbar-action-button" :class="{ 'is-open-drawer': currentDrawer === 'preview' }" color="white" size="large" type="secondary" icon="open_in_new" tooltip="Preview" @click.stop="toggleDrawer('preview')"></ui-icon-button>
        <ui-button v-if="isPageEditMode" class="toolbar-publish-button" :class="{ 'is-open-drawer': currentDrawer === 'publish-page' }" type="primary" color="primary" size="large" @click.stop="toggleDrawer('publish-page')"><span class="toolbar-button-text">Publishing</span></ui-button>
        <ui-button v-if="!isPageEditMode" class="toolbar-publish-button" :class="{ 'is-open-drawer': currentDrawer === 'publish-layout' }" type="primary" color="primary" size="large" @click.stop="toggleDrawer('publish-layout')"><span class="toolbar-button-text">Publishing</span></ui-button>
      </div>
    </ui-toolbar>
    <div class="kiln-progress">
      <progress-bar></progress-bar>
    </div>
    <background></background>
    <overlay></overlay>
    <add-component></add-component>
    <nav-background></nav-background>
    <nav-menu></nav-menu>
    <nav-content></nav-content>
    <simple-modal></simple-modal>
    <confirm></confirm>
    <ui-snackbar-container ref="snacks"></ui-snackbar-container>
  </div>
</template>

<script>
  import _ from 'lodash';
  import { mapState } from 'vuex';
  import isAfter from 'date-fns/is_after';
  import differenceInMinutes from 'date-fns/difference_in_minutes';
  import toggleEdit from '../utils/toggle-edit';
  import { getItem } from '../utils/local';
  import progressBar from './progress.vue';
  import background from './background.vue';
  import overlay from '../forms/overlay.vue';
  import addComponent from '../component-data/add-component.vue';
  import simpleModal from './simple-modal.vue';
  import UiToolbar from 'keen/UiToolbar';
  import UiButton from 'keen/UiButton';
  import UiIconButton from 'keen/UiIconButton';
  import UiMenu from 'keen/UiMenu';
  import UiSnackbarContainer from 'keen/UiSnackbarContainer';
  import drawer from '../drawers/drawer.vue';
  import navBackground from '../nav/nav-background.vue';
  import navMenu from '../nav/nav-menu.vue';
  import navContent from '../nav/nav-content.vue';
  import confirm from './confirm.vue';
  import alertContainer from './alert-container.vue';
  import logger from '../utils/log';
  import { getLayoutNameAndInstance } from '../utils/references';

  const log = logger(__filename);

  /**
   * get the last user who edited a layout, who ISN'T the current user
   * @param  {object} store
   * @return {null|string}
   */
  function getLastLayoutEditUser(store) {
    const currentUser = _.get(store, 'state.user'),
      lastUser = _.get(store, 'state.layout.updateUser'),
      timestamp = _.get(store, 'state.layout.updateTime'),
      isDifferentUser = currentUser.username !== lastUser.username,
      isWithinFiveMinutes = Math.abs(differenceInMinutes(timestamp, new Date())) < 5;

    return isDifferentUser && isWithinFiveMinutes ? lastUser.name : null;
  }

  export default {
    data() {
      return {};
    },
    computed: mapState({
      pageState: (state) => state.page.state,
      layoutState: (state) => state.layout,
      isLoading: (state) => state.isLoading,
      isPageEditMode: (state) => state.editMode === 'page',
      undoEnabled: (state) => {
        return !state.undo.atStart && !state.ui.currentFocus && !state.ui.currentPane;
      },
      redoEnabled: (state) => {
        return !state.undo.atEnd && !state.ui.currentFocus && !state.ui.currentPane;
      },
      customButtons() {
        return Object.keys(window.kiln.toolbarButtons);
      },
      hasPageChanges: (state) => {
        const pubTime = _.get(state, 'page.state.publishTime'), // latest published timestamp
          upTime = _.get(state, 'page.state.updateTime'); // latest updated timestamp

        if (pubTime && upTime) {
          return isAfter(upTime, pubTime);
        } else {
          return false;
        }
      },
      hasLayoutChanges: (state) => {
        const pubTime = _.get(state, 'layout.publishTime'), // latest published timestamp
          upTime = _.get(state, 'layout.updateTime'); // latest updated timestamp

        if (pubTime && upTime) {
          return isAfter(upTime, pubTime);
        } else {
          return false;
        }
      },
      statusIcon() {
        return this.isPageEditMode ? 'mode_edit' : 'layers';
      },
      pageStatus() {
        if (this.isLoading) {
          return ''; // still loading the page, don't display any status
        } else if (this.pageState.scheduled) {
          return 'Page: Scheduled';
        } else if (this.pageState.published && this.hasPageChanges) {
          return 'Page: Unpublished Changes';
        } else if (this.pageState.published) {
          return 'Page: Published';
        } else if (this.pageState.archived) {
          return 'Page: Archived';
        } else {
          return 'Page: Draft';
        }
      },
      layoutStatus() {
        if (this.isLoading) {
          return ''; // still loading the layout, don't display any status
        } else if (this.layoutState.scheduled) {
          return 'Layout: Scheduled';
        } else if (this.layoutState.published && this.hasLayoutChanges) {
          return 'Layout: Unpublished Changes';
        } else if (this.layoutState.published) {
          return 'Layout: Published';
        } else {
          return 'Layout: Draft';
        }
      },
      status() {
        if (this.isPageEditMode) {
          return this.pageStatus;
        } else {
          return this.layoutStatus;
        }
      },
      isAdmin(state) {
        return _.get(state, 'user.auth') === 'admin';
      },
      toggleOptions(state) {
        if (this.isAdmin) {
          return [
            { label: 'Edit Page', value: 'page', icon: 'mode_edit', disabled: state.editMode === 'page' },
            { label: 'Edit Layout', value: 'layout', icon: 'layers', disabled: state.editMode === 'layout' },
            { label: 'View Page', value: 'view', icon: 'remove_red_eye' }
          ];
        } else {
          return [
            { label: 'Edit Page', value: 'page', icon: 'mode_edit', disabled: true },
            { label: 'View Page', value: 'view', icon: 'remove_red_eye' }
          ];
        }
      },
      componentsTooltip() {
        return this.isPageEditMode ? 'Find on Page' : 'Find on Layout';
      },
      toolbarOptions() {
        if (this.isPageEditMode) {
          return [{
            label: 'Undo',
            icon: 'undo',
            disabled: !this.undoEnabled
          }, {
            label: 'Redo',
            icon: 'redo',
            disabled: !this.redoEnabled
          }, {
            type: 'divider'
          }, {
            label: 'Contributors',
            icon: 'people'
          }, {
            label: 'Find on Page',
            icon: 'find_in_page'
          }, {
            label: 'Preview',
            icon: 'open_in_new'
          }];
        } else {
          // display fewer options in layout edit mode, until we have a 'layouts' index
          return [{
            label: 'Undo',
            icon: 'undo',
            disabled: !this.undoEnabled
          }, {
            label: 'Redo',
            icon: 'redo',
            disabled: !this.redoEnabled
          }, {
            type: 'divider'
          }, {
            label: 'Find on Layout',
            icon: 'find_in_page'
          }, {
            label: 'Preview',
            icon: 'open_in_new'
          }];
        }
      },
      snackbar() {
        return _.get(this.$store, 'state.ui.snackbar') && _.toPlainObject(_.get(this.$store, 'state.ui.snackbar'));
      },
      currentDrawer() {
        return _.get(this.$store, 'state.ui.currentDrawer');
      }
    }),
    watch: {
      snackbar(val) {
        if (val) {
          this.$refs.snacks.createSnackbar(val);
          this.$store.dispatch('hideSnackbar'); // clear the store
        }
      }
    },
    methods: {
      toggleEditMode(option) {
        const val = option.value,
          { message } = getLayoutNameAndInstance(this.$store),
          layoutAlert = { type: 'warning', text: message },
          lastUserName = getLastLayoutEditUser(this.$store),
          layoutUserAlert = lastUserName && { type: 'info', message: `Edited less than 5 minutes ago by ${lastUserName}` };

        if (val === 'view') {
          this.$store.commit('STOP_EDITING');
          toggleEdit();
        } else if (val === 'page') {
          // page editing
          this.$store.commit('TOGGLE_EDIT_MODE', 'page');
          this.$refs.modeToggle.closeDropdown();
          this.closeDrawer();
          this.$store.dispatch('removeAlert', layoutAlert);
        } else {
          // layout editing
          this.$store.commit('TOGGLE_EDIT_MODE', 'layout');
          this.$refs.modeToggle.closeDropdown();
          this.closeDrawer();
          this.$store.dispatch('addAlert', layoutAlert);
          if (layoutUserAlert) {
            this.$store.dispatch('addAlert', layoutUserAlert);
          }
        }
      },
      undo() {
        return this.$store.dispatch('undo');
      },
      redo() {
        return this.$store.dispatch('redo');
      },
      toggleDrawer(name) {
        return this.$store.dispatch('toggleDrawer', name);
      },
      toggleDrawerFromMenu(option) {
        switch (option.label) {
          case 'Undo': return this.undo();
          case 'Redo': return this.redo();
          case 'Contributors': return this.toggleDrawer('contributors');
          case 'Find on Page': return this.toggleDrawer('components');
          case 'Find on Layout': return this.toggleDrawer('components');
          case 'Preview': return this.toggleDrawer('preview');
          default: log.warn(`Unknown drawer: ${option.label}`);
        }
      },
      closeDrawer() {
        return this.$store.dispatch('closeDrawer');
      },
      openNav() {
        return getItem('claymenu:activetab').then((savedTab) => {
          const activeNav = savedTab || 'all-pages';

          return this.$store.dispatch('openNav', activeNav);
        });
      }
    },
    components: _.merge({
      background,
      overlay,
      'add-component': addComponent,
      'simple-modal': simpleModal,
      UiToolbar,
      UiIconButton,
      UiButton,
      UiMenu,
      UiSnackbarContainer,
      'progress-bar': progressBar,
      drawer,
      'nav-background': navBackground,
      'nav-menu': navMenu,
      'nav-content': navContent,
      confirm,
      'alert-container': alertContainer
    }, window.kiln.toolbarButtons)
  };
</script>
