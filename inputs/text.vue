<docs>
  # text

  A basic text input. Can be single line or multi-line. Uses the float label pattern.

  ## Arguments

  * **type** - defaults to `text` if not defined. Set to `multi-line` for a multi-line text area
  * **step** - define step increments (for numberical inputs only)
  * **enforceMaxlength** - prevent user from typing more characters than the maximum allowed (`from validate.max`)

  ### Shared Arguments

  This input shares certain arguments with other inputs:

  * **help** - description / helper text for the field
  * **attachedButton** - an icon button that should be attached to the field, to allow additional functionality
  * **validate** - an object that contains pre-publish validation rules:

  * **validate.required** - either `true` or an object that described the conditions that should make this field required
  * **validate.min** - minimum number (for `type=numer`) or length (for other types) that the field must meet
  * **validate.max** - maximum number (for `type=number`) or length (for other types) that the field must not exceed
  * **validate.pattern** - regex pattern

  Validation rules may also have custom error messages, that will appear in the same place as the help text. If you do not specify a message, default error messages will appear.

  * **validate.requiredMessage** - will appear when required validation fails
  * **validate.minMessage** - will appear when minimum validation fails
  * **validate.maxMessage** - will appear when maximum validation fails
  * **validate.patternMessage** - will appear when pattern validation fails (very handy to set, as the default message is vague)

  ### Conditional Required Arguments

  * **field** to compare against (inside complex-list item, current form, or current component)
  * **operator** _(optional)_ to use for the comparison
  * **value** _(optional)_ to compare the field against

  If neither `operator` nor `value` are specified, this will make the current field required if the compared field has any data (i.e. if it's not empty). If only the value is specified, it'll default to strict equality.

  Operators:

  * `===`
  * `!==`
  * `<`
  * `>`
  * `<=`
  * `>=`
  * `typeof`
  * `regex`
  * `empty` (only checks field data, no value needed)
  * `not-empty` (only checks field data, no value needed)
  * `truthy` (only checks field data, no value needed)
  * `falsy` (only checks field data, no value needed)

  _Note:_ You can compare against deep fields (like checkbox-group) by using dot-separated paths, e.g. `featureTypes.New York Magazine Story` (don't worry about spaces!)

  Note: labels are pulled from the field's `_label` property.
</docs>

<template>
  <ui-textbox
    :value="data"
    :type="type"
    :multiLine="isMultiline"
    :invalid="isInvalid"
    :required="isRequired"
    :min="min"
    :max="max"
    :step="step"
    :maxlength="maxLength"
    :enforceMaxlength="args.enforceMaxlength"
    :label="label"
    :floatingLabel="true"
    :help="args.help"
    :error="errorMessage"
    :disabled="isDisabled"
    iconPosition="right"
    @input="update"
    @keydown-enter="closeFormOnEnter">
    <component v-if="hasButton" slot="icon" :is="args.attachedButton.name" :name="name" :data="data" :schema="schema" :args="args.attachedButton" @disable="disableInput" @enable="enableInput"></component>
  </ui-textbox>
</template>

<script>
  import _ from 'lodash';
  import { UPDATE_FORMDATA } from '../lib/forms/mutationTypes';
  import { setCaret, isFirstField, shouldBeRequired, getValidationError } from '../lib/forms/field-helpers';
  import label from '../lib/utils/label';
  import logger from '../lib/utils/log';
  import UiTextbox from 'keen/UiTextbox';

  const log = logger(__filename);

  export default {
    props: ['name', 'data', 'schema', 'args'],
    data() {
      return {
        isDisabled: false
      };
    },
    computed: {
      type() {
        if (this.args.type === 'multi-line' || !this.args.type) {
          return 'text';
        } else {
          return this.args.type;
        }
      },
      isMultiline() {
        return this.args.type === 'multi-line';
      },
      isRequired() {
        return _.get(this.args, 'validate.required') === true || shouldBeRequired(this.args.validate, this.$store, this.name);
      },
      min() {
        return _.includes(['number', 'range'], this.args.type) ? _.get(this.args, 'validate.min') : 0;
      },
      max() {
        return _.includes(['number', 'range'], this.args.type) ? _.get(this.args, 'validate.max') : 0;
      },
      step() {
        return this.args.step ? this.args.step.toString() : 'any';
      },
      maxLength() {
        return !_.includes(['number', 'range'], this.args.type) ? _.get(this.args, 'validate.max') : 0;
      },
      label() {
        return `${label(this.name, this.schema)}${this.isRequired ? '*' : ''}`;
      },
      hasButton() {
        const button = _.get(this, 'args.attachedButton');

        if (button && !_.get(window, `kiln.inputs['${button.name}']`)) {
          log.warn(`Attached button (${button.name}) for '${this.name}' not found!`, { action: 'hasButton', input: this.args });
          return false;
        } else if (button) {
          return true;
        } else {
          return false;
        }
      },
      errorMessage() {
        return getValidationError(this.data, this.args.validate, this.$store, this.name);
      },
      isInvalid() {
        return !!this.errorMessage;
      }
    },
    methods: {
      // every time the value of the input changes, update the store
      update(val) {
        this.$store.commit(UPDATE_FORMDATA, { path: this.name, data: val });
      },
      closeFormOnEnter() {
        // close form when hitting enter in text fields
        this.$store.dispatch('unfocus');
      },
      disableInput() {
        this.isDisabled = true;
      },
      enableInput() {
        this.isDisabled = false;
      }
    },
    mounted() {
      if (isFirstField(this.$el)) {
        const offset = _.get(this, '$store.state.ui.currentForm.initialOffset');

        this.$nextTick(() => {
          if (_.includes(['text', 'search', 'url', 'tel', 'password', 'multi-line'], this.args.type)) {
            // selection range is only permitted on text-like input types
            setCaret(this.$el, offset, this.data);
          }
        });
      }
    },
    components: _.merge(window.kiln.inputs, { UiTextbox }) // attached button
  };
</script>