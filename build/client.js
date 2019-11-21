var Component = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    let running = false;
    function run_tasks() {
        tasks.forEach(task => {
            if (!task[0](now())) {
                tasks.delete(task);
                task[1]();
            }
        });
        running = tasks.size > 0;
        if (running)
            raf(run_tasks);
    }
    function loop(fn) {
        let task;
        if (!running) {
            running = true;
            raf(run_tasks);
        }
        return {
            promise: new Promise(fulfil => {
                tasks.add(task = [fn, fulfil]);
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                for (let j = 0; j < node.attributes.length; j += 1) {
                    const attribute = node.attributes[j];
                    if (!attributes[attribute.name])
                        node.removeAttribute(attribute.name);
                }
                return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, props) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : prop_values;
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quintOut(t) {
        return --t * t * t * t * t + 1;
    }

    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    var cssVars = (e,t)=>{let r=new Set(Object.keys(t));return r.forEach(r=>{e.style.setProperty(`--${r}`,t[r]);}),{update(t){const o=new Set(Object.keys(t));o.forEach(o=>{e.style.setProperty(`--${o}`,t[o]),r.delete(o);}),r.forEach(t=>e.style.removeProperty(`--${t}`)),r=o;}}};

    /* src/index.svelte generated by Svelte v3.14.1 */
    const file = "src/index.svelte";

    // (91:0) {#if isLeftDrawerOpen}
    function create_if_block_1(ctx) {
    	let aside;
    	let div0;
    	let h3;
    	let t0;
    	let t1;
    	let button0;
    	let svg0;
    	let path0;
    	let t2;
    	let div2;
    	let div1;
    	let input;
    	let t3;
    	let button1;
    	let svg1;
    	let path1;
    	let aside_transition;
    	let current;
    	let dispose;

    	const block = {
    		c: function create() {
    			aside = element("aside");
    			div0 = element("div");
    			h3 = element("h3");
    			t0 = text("SEARCH MATTAMY HOMES");
    			t1 = space();
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			t2 = space();
    			div2 = element("div");
    			div1 = element("div");
    			input = element("input");
    			t3 = space();
    			button1 = element("button");
    			svg1 = svg_element("svg");
    			path1 = svg_element("path");
    			this.h();
    		},
    		l: function claim(nodes) {
    			aside = claim_element(nodes, "ASIDE", { class: true });
    			var aside_nodes = children(aside);
    			div0 = claim_element(aside_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			h3 = claim_element(div0_nodes, "H3", { class: true });
    			var h3_nodes = children(h3);
    			t0 = claim_text(h3_nodes, "SEARCH MATTAMY HOMES");
    			h3_nodes.forEach(detach_dev);
    			t1 = claim_space(div0_nodes);
    			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			svg0 = claim_element(button0_nodes, "svg", { viewBox: true, fill: true }, 1);
    			var svg0_nodes = children(svg0);
    			path0 = claim_element(svg0_nodes, "path", { fill: true, d: true }, 1);
    			children(path0).forEach(detach_dev);
    			svg0_nodes.forEach(detach_dev);
    			button0_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			t2 = claim_space(aside_nodes);
    			div2 = claim_element(aside_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);

    			input = claim_element(div1_nodes, "INPUT", {
    				type: true,
    				name: true,
    				placeholder: true,
    				class: true
    			});

    			t3 = claim_space(div1_nodes);
    			button1 = claim_element(div1_nodes, "BUTTON", { type: true, class: true });
    			var button1_nodes = children(button1);
    			svg1 = claim_element(button1_nodes, "svg", { viewBox: true, fill: true }, 1);
    			var svg1_nodes = children(svg1);

    			path1 = claim_element(
    				svg1_nodes,
    				"path",
    				{
    					fill: true,
    					"fill-rule": true,
    					"clip-rule": true,
    					d: true
    				},
    				1
    			);

    			children(path1).forEach(detach_dev);
    			svg1_nodes.forEach(detach_dev);
    			button1_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			aside_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h3, "class", "font-trade-gothic-20 text-lg text-black pl-4");
    			add_location(h3, file, 97, 6, 2691);
    			attr_dev(path0, "fill", "currentColor");
    			attr_dev(path0, "d", "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19\n            12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z");
    			add_location(path0, file, 102, 10, 2921);
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "fill", "none");
    			add_location(svg0, file, 101, 8, 2873);
    			attr_dev(button0, "class", "w-8 h-8 text-actionblue");
    			add_location(button0, file, 100, 6, 2796);
    			attr_dev(div0, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div0, file, 94, 4, 2582);
    			attr_dev(input, "type", "search");
    			attr_dev(input, "name", "search");
    			attr_dev(input, "placeholder", "Enter keyword to search");
    			attr_dev(input, "class", "bg-white h-12 w-full pl-5 pr-12 py-2 appearance-none leading-normal rounded-full text-sm focus:outline-none border border-gray-500");
    			add_location(input, file, 112, 8, 3264);
    			attr_dev(path1, "fill", "currentColor");
    			attr_dev(path1, "fill-rule", "evenodd");
    			attr_dev(path1, "clip-rule", "evenodd");
    			attr_dev(path1, "d", "M14.71 14h.79l4.99 5L19 20.49l-5-4.99v-.79l-.27-.28A6.471 6.471 0\n        019.5 16 6.5 6.5 0 1116 9.5c0 1.61-.59 3.09-1.57 4.23l.28.27zM5 9.5C5\n        11.99 7.01 14 9.5 14S14 11.99 14 9.5 11.99 5 9.5 5 5 7.01 5 9.5z");
    			add_location(path1, file, 120, 6, 3651);
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "fill", "none");
    			add_location(svg1, file, 119, 10, 3607);
    			attr_dev(button1, "type", "submit");
    			attr_dev(button1, "class", "text-actionblue absolute h-8 w-8 mr-2");
    			add_location(button1, file, 118, 8, 3528);
    			attr_dev(div1, "class", "px-4 py-6 h-16 flex items-center justify-end text-gray-600");
    			add_location(div1, file, 111, 6, 3183);
    			attr_dev(div2, "class", "bg-white h-full");
    			add_location(div2, file, 110, 4, 3147);
    			attr_dev(aside, "class", "w-screen h-screen bg-white z-50 absolute top-0 flex flex-col");
    			add_location(aside, file, 91, 2, 2419);
    			dispose = listen_dev(button0, "click", ctx.toggleLeftDrawer, false, false, false);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, aside, anchor);
    			append_dev(aside, div0);
    			append_dev(div0, h3);
    			append_dev(h3, t0);
    			append_dev(div0, t1);
    			append_dev(div0, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, path0);
    			append_dev(aside, t2);
    			append_dev(aside, div2);
    			append_dev(div2, div1);
    			append_dev(div1, input);
    			append_dev(div1, t3);
    			append_dev(div1, button1);
    			append_dev(button1, svg1);
    			append_dev(svg1, path1);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!aside_transition) aside_transition = create_bidirectional_transition(
    					aside,
    					fly,
    					{
    						duration: 250,
    						x: -400,
    						opacity: 0,
    						easing: quintOut
    					},
    					true
    				);

    				aside_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!aside_transition) aside_transition = create_bidirectional_transition(
    				aside,
    				fly,
    				{
    					duration: 250,
    					x: -400,
    					opacity: 0,
    					easing: quintOut
    				},
    				false
    			);

    			aside_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(aside);
    			if (detaching && aside_transition) aside_transition.end();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(91:0) {#if isLeftDrawerOpen}",
    		ctx
    	});

    	return block;
    }

    // (135:0) {#if isRightDrawerOpen}
    function create_if_block(ctx) {
    	let aside;
    	let div2;
    	let button0;
    	let svg0;
    	let path0;
    	let t0;
    	let div1;
    	let span0;
    	let t1;
    	let t2;
    	let div0;
    	let button1;
    	let span1;
    	let t3;
    	let span2;
    	let t4;
    	let t5;
    	let div3;
    	let a0;
    	let t6;
    	let t7;
    	let div4;
    	let a1;
    	let t8;
    	let t9;
    	let div5;
    	let a2;
    	let t10;
    	let t11;
    	let div6;
    	let a3;
    	let t12;
    	let t13;
    	let div7;
    	let a4;
    	let t14;
    	let t15;
    	let span3;
    	let svg1;
    	let path1;
    	let text_1;
    	let t16;
    	let aside_transition;
    	let current;
    	let dispose;

    	const block = {
    		c: function create() {
    			aside = element("aside");
    			div2 = element("div");
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			t0 = space();
    			div1 = element("div");
    			span0 = element("span");
    			t1 = text("USA");
    			t2 = space();
    			div0 = element("div");
    			button1 = element("button");
    			span1 = element("span");
    			t3 = space();
    			span2 = element("span");
    			t4 = text("CANADA");
    			t5 = space();
    			div3 = element("div");
    			a0 = element("a");
    			t6 = text("Find It");
    			t7 = space();
    			div4 = element("div");
    			a1 = element("a");
    			t8 = text("Design It");
    			t9 = space();
    			div5 = element("div");
    			a2 = element("a");
    			t10 = text("Make It Happen");
    			t11 = space();
    			div6 = element("div");
    			a3 = element("a");
    			t12 = text("Why Mattamy");
    			t13 = space();
    			div7 = element("div");
    			a4 = element("a");
    			t14 = text("Saved");
    			t15 = space();
    			span3 = element("span");
    			svg1 = svg_element("svg");
    			path1 = svg_element("path");
    			text_1 = svg_element("text");
    			t16 = text("12");
    			this.h();
    		},
    		l: function claim(nodes) {
    			aside = claim_element(nodes, "ASIDE", { class: true });
    			var aside_nodes = children(aside);
    			div2 = claim_element(aside_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			button0 = claim_element(div2_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			svg0 = claim_element(button0_nodes, "svg", { viewBox: true, fill: true }, 1);
    			var svg0_nodes = children(svg0);
    			path0 = claim_element(svg0_nodes, "path", { fill: true, d: true }, 1);
    			children(path0).forEach(detach_dev);
    			svg0_nodes.forEach(detach_dev);
    			button0_nodes.forEach(detach_dev);
    			t0 = claim_space(div2_nodes);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			span0 = claim_element(div1_nodes, "SPAN", { class: true });
    			var span0_nodes = children(span0);
    			t1 = claim_text(span0_nodes, "USA");
    			span0_nodes.forEach(detach_dev);
    			t2 = claim_space(div1_nodes);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			span1 = claim_element(button1_nodes, "SPAN", { class: true });
    			children(span1).forEach(detach_dev);
    			button1_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			t3 = claim_space(div1_nodes);
    			span2 = claim_element(div1_nodes, "SPAN", { class: true });
    			var span2_nodes = children(span2);
    			t4 = claim_text(span2_nodes, "CANADA");
    			span2_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			t5 = claim_space(aside_nodes);
    			div3 = claim_element(aside_nodes, "DIV", { class: true });
    			var div3_nodes = children(div3);
    			a0 = claim_element(div3_nodes, "A", { class: true, href: true });
    			var a0_nodes = children(a0);
    			t6 = claim_text(a0_nodes, "Find It");
    			a0_nodes.forEach(detach_dev);
    			div3_nodes.forEach(detach_dev);
    			t7 = claim_space(aside_nodes);
    			div4 = claim_element(aside_nodes, "DIV", { class: true });
    			var div4_nodes = children(div4);
    			a1 = claim_element(div4_nodes, "A", { class: true, href: true });
    			var a1_nodes = children(a1);
    			t8 = claim_text(a1_nodes, "Design It");
    			a1_nodes.forEach(detach_dev);
    			div4_nodes.forEach(detach_dev);
    			t9 = claim_space(aside_nodes);
    			div5 = claim_element(aside_nodes, "DIV", { class: true });
    			var div5_nodes = children(div5);
    			a2 = claim_element(div5_nodes, "A", { class: true, href: true });
    			var a2_nodes = children(a2);
    			t10 = claim_text(a2_nodes, "Make It Happen");
    			a2_nodes.forEach(detach_dev);
    			div5_nodes.forEach(detach_dev);
    			t11 = claim_space(aside_nodes);
    			div6 = claim_element(aside_nodes, "DIV", { class: true });
    			var div6_nodes = children(div6);
    			a3 = claim_element(div6_nodes, "A", { class: true, href: true });
    			var a3_nodes = children(a3);
    			t12 = claim_text(a3_nodes, "Why Mattamy");
    			a3_nodes.forEach(detach_dev);
    			div6_nodes.forEach(detach_dev);
    			t13 = claim_space(aside_nodes);
    			div7 = claim_element(aside_nodes, "DIV", { class: true });
    			var div7_nodes = children(div7);
    			a4 = claim_element(div7_nodes, "A", { class: true, href: true });
    			var a4_nodes = children(a4);
    			t14 = claim_text(a4_nodes, "Saved");
    			a4_nodes.forEach(detach_dev);
    			t15 = claim_space(div7_nodes);
    			span3 = claim_element(div7_nodes, "SPAN", { class: true });
    			var span3_nodes = children(span3);
    			svg1 = claim_element(span3_nodes, "svg", { viewBox: true }, 1);
    			var svg1_nodes = children(svg1);
    			path1 = claim_element(svg1_nodes, "path", { fill: true, d: true }, 1);
    			children(path1).forEach(detach_dev);

    			text_1 = claim_element(
    				svg1_nodes,
    				"text",
    				{
    					x: true,
    					y: true,
    					fill: true,
    					"font-size": true,
    					"dominant-baseline": true,
    					"text-anchor": true
    				},
    				1
    			);

    			var text_1_nodes = children(text_1);
    			t16 = claim_text(text_1_nodes, "12");
    			text_1_nodes.forEach(detach_dev);
    			svg1_nodes.forEach(detach_dev);
    			span3_nodes.forEach(detach_dev);
    			div7_nodes.forEach(detach_dev);
    			aside_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path0, "fill", "currentColor");
    			attr_dev(path0, "d", "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19\n            12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z");
    			add_location(path0, file, 143, 10, 4453);
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "fill", "none");
    			add_location(svg0, file, 142, 8, 4405);
    			attr_dev(button0, "class", "w-8 h-8 text-actionblue");
    			add_location(button0, file, 141, 6, 4327);
    			attr_dev(span0, "class", "font-trade-gothic-20 text-sm tracking-tighter");
    			add_location(span0, file, 151, 8, 4722);
    			attr_dev(span1, "class", "rounded-full border w-4 h-4 border-grey shadow-inner\n              bg-white shadow absolute svelte-18o8j06");
    			toggle_class(span1, "switch-off", ctx.isUSA);
    			toggle_class(span1, "switch-on", !ctx.isUSA);
    			add_location(span1, file, 160, 12, 5139);
    			attr_dev(button1, "class", "border rounded-full border-grey bg-actionblue flex\n            items-center cursor-pointer w-12 h-6 px-1 relative");
    			toggle_class(button1, "justify-start", ctx.isUSA);
    			toggle_class(button1, "justify-end", !ctx.isUSA);
    			add_location(button1, file, 154, 10, 4869);
    			attr_dev(div0, "class", "flex items-center justify-between h-12 m-2");
    			add_location(div0, file, 153, 8, 4802);
    			attr_dev(span2, "class", "font-trade-gothic-20 text-sm text-actionblue tracking-tighter");
    			add_location(span2, file, 168, 8, 5384);
    			attr_dev(div1, "class", "flex items-center justify-end");
    			add_location(div1, file, 150, 6, 4670);
    			attr_dev(div2, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div2, file, 138, 4, 4218);
    			attr_dev(a0, "class", "font-franklin text-lg text-actionblue p-4 font-bold");
    			attr_dev(a0, "href", "/");
    			add_location(a0, file, 178, 6, 5642);
    			attr_dev(div3, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div3, file, 175, 4, 5533);
    			attr_dev(a1, "class", "font-franklin text-lg text-actionblue p-4 font-bold");
    			attr_dev(a1, "href", "/");
    			add_location(a1, file, 186, 6, 5867);
    			attr_dev(div4, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div4, file, 183, 4, 5758);
    			attr_dev(a2, "class", "font-franklin text-lg text-actionblue p-4 font-bold");
    			attr_dev(a2, "href", "/");
    			add_location(a2, file, 194, 6, 6094);
    			attr_dev(div5, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div5, file, 191, 4, 5985);
    			attr_dev(a3, "class", "font-franklin text-lg text-actionblue p-4 font-bold");
    			attr_dev(a3, "href", "/");
    			add_location(a3, file, 202, 6, 6326);
    			attr_dev(div6, "class", "flex items-center justify-between w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div6, file, 199, 4, 6217);
    			attr_dev(a4, "class", "font-franklin text-lg text-actionblue p-4 font-bold");
    			attr_dev(a4, "href", "/");
    			add_location(a4, file, 210, 6, 6553);
    			attr_dev(path1, "fill", "currentColor");
    			attr_dev(path1, "d", "M109 618.7c60.8 80.6 139.8 145.3 222 203.8 0 0 98 67.9 143 99.5\n            16.6 11.1 37.9 11.1 53.7 0 45-31.6 142.2-99.5 142.2-99.5C752 764\n            829.4 700 891 618.7c52.1-69.5 90.8-151.7 97.9-238.6\n            12.6-158-89.3-309.6-258.3-309.6-98.7 0-185.6 53.7-229.9 133.5C455\n            123.4 368.9 69.7 270.1 69.7 101.9 69.7-1.6 221.4 11 379.3c7.2 86.9\n            45.1 169.9 98 239.4z");
    			add_location(path1, file, 215, 10, 6746);
    			attr_dev(text_1, "x", "50%");
    			attr_dev(text_1, "y", "50%");
    			attr_dev(text_1, "fill", "white");
    			attr_dev(text_1, "font-size", "20rem");
    			attr_dev(text_1, "dominant-baseline", "middle");
    			attr_dev(text_1, "text-anchor", "middle");
    			add_location(text_1, file, 223, 10, 7208);
    			attr_dev(svg1, "viewBox", "0 0 1000 1000");
    			add_location(svg1, file, 214, 8, 6706);
    			attr_dev(span3, "class", "text-actionblue w-10 h-10");
    			add_location(span3, file, 213, 6, 6657);
    			attr_dev(div7, "class", "flex items-center justify-start w-full h-16 border-b-2\n      border-gray-300 p-2");
    			add_location(div7, file, 207, 4, 6446);
    			attr_dev(aside, "class", "w-screen h-screen bg-white z-50 absolute top-0");
    			add_location(aside, file, 135, 2, 4070);

    			dispose = [
    				listen_dev(button0, "click", ctx.toggleRightDrawer, false, false, false),
    				listen_dev(button1, "click", ctx.toggleLocale, false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, aside, anchor);
    			append_dev(aside, div2);
    			append_dev(div2, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, path0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div1, span0);
    			append_dev(span0, t1);
    			append_dev(div1, t2);
    			append_dev(div1, div0);
    			append_dev(div0, button1);
    			append_dev(button1, span1);
    			append_dev(div1, t3);
    			append_dev(div1, span2);
    			append_dev(span2, t4);
    			append_dev(aside, t5);
    			append_dev(aside, div3);
    			append_dev(div3, a0);
    			append_dev(a0, t6);
    			append_dev(aside, t7);
    			append_dev(aside, div4);
    			append_dev(div4, a1);
    			append_dev(a1, t8);
    			append_dev(aside, t9);
    			append_dev(aside, div5);
    			append_dev(div5, a2);
    			append_dev(a2, t10);
    			append_dev(aside, t11);
    			append_dev(aside, div6);
    			append_dev(div6, a3);
    			append_dev(a3, t12);
    			append_dev(aside, t13);
    			append_dev(aside, div7);
    			append_dev(div7, a4);
    			append_dev(a4, t14);
    			append_dev(div7, t15);
    			append_dev(div7, span3);
    			append_dev(span3, svg1);
    			append_dev(svg1, path1);
    			append_dev(svg1, text_1);
    			append_dev(text_1, t16);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (changed.isUSA) {
    				toggle_class(span1, "switch-off", ctx.isUSA);
    			}

    			if (changed.isUSA) {
    				toggle_class(span1, "switch-on", !ctx.isUSA);
    			}

    			if (changed.isUSA) {
    				toggle_class(button1, "justify-start", ctx.isUSA);
    			}

    			if (changed.isUSA) {
    				toggle_class(button1, "justify-end", !ctx.isUSA);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!aside_transition) aside_transition = create_bidirectional_transition(
    					aside,
    					fly,
    					{
    						duration: 250,
    						x: 400,
    						opacity: 0,
    						easing: quintOut
    					},
    					true
    				);

    				aside_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!aside_transition) aside_transition = create_bidirectional_transition(
    				aside,
    				fly,
    				{
    					duration: 250,
    					x: 400,
    					opacity: 0,
    					easing: quintOut
    				},
    				false
    			);

    			aside_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(aside);
    			if (detaching && aside_transition) aside_transition.end();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(135:0) {#if isRightDrawerOpen}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let header;
    	let button0;
    	let svg0;
    	let path0;
    	let t0;
    	let div;
    	let t1;
    	let button1;
    	let svg1;
    	let path1;
    	let cssVars_action;
    	let t2;
    	let t3;
    	let if_block1_anchor;
    	let current;
    	let dispose;
    	let if_block0 = ctx.isLeftDrawerOpen && create_if_block_1(ctx);
    	let if_block1 = ctx.isRightDrawerOpen && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			header = element("header");
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			t0 = space();
    			div = element("div");
    			t1 = space();
    			button1 = element("button");
    			svg1 = svg_element("svg");
    			path1 = svg_element("path");
    			t2 = space();
    			if (if_block0) if_block0.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			this.h();
    		},
    		l: function claim(nodes) {
    			header = claim_element(nodes, "HEADER", { class: true });
    			var header_nodes = children(header);
    			button0 = claim_element(header_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			svg0 = claim_element(button0_nodes, "svg", { viewBox: true, fill: true }, 1);
    			var svg0_nodes = children(svg0);

    			path0 = claim_element(
    				svg0_nodes,
    				"path",
    				{
    					fill: true,
    					"fill-rule": true,
    					"clip-rule": true,
    					d: true
    				},
    				1
    			);

    			children(path0).forEach(detach_dev);
    			svg0_nodes.forEach(detach_dev);
    			button0_nodes.forEach(detach_dev);
    			t0 = claim_space(header_nodes);
    			div = claim_element(header_nodes, "DIV", { class: true });
    			children(div).forEach(detach_dev);
    			t1 = claim_space(header_nodes);
    			button1 = claim_element(header_nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			svg1 = claim_element(button1_nodes, "svg", { viewBox: true, fill: true }, 1);
    			var svg1_nodes = children(svg1);

    			path1 = claim_element(
    				svg1_nodes,
    				"path",
    				{
    					fill: true,
    					"fill-rule": true,
    					"clip-rule": true,
    					d: true
    				},
    				1
    			);

    			children(path1).forEach(detach_dev);
    			svg1_nodes.forEach(detach_dev);
    			button1_nodes.forEach(detach_dev);
    			header_nodes.forEach(detach_dev);
    			t2 = claim_space(nodes);
    			if (if_block0) if_block0.l(nodes);
    			t3 = claim_space(nodes);
    			if (if_block1) if_block1.l(nodes);
    			if_block1_anchor = empty();
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path0, "fill", "currentColor");
    			attr_dev(path0, "fill-rule", "evenodd");
    			attr_dev(path0, "clip-rule", "evenodd");
    			attr_dev(path0, "d", "M14.71 14h.79l4.99 5L19 20.49l-5-4.99v-.79l-.27-.28A6.471 6.471 0\n        019.5 16 6.5 6.5 0 1116 9.5c0 1.61-.59 3.09-1.57 4.23l.28.27zM5 9.5C5\n        11.99 7.01 14 9.5 14S14 11.99 14 9.5 11.99 5 9.5 5 5 7.01 5 9.5z");
    			add_location(path0, file, 66, 6, 1592);
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "fill", "none");
    			add_location(svg0, file, 65, 4, 1548);
    			attr_dev(button0, "class", "w-10 h-10 text-actionblue");
    			add_location(button0, file, 64, 2, 1473);
    			attr_dev(div, "class", "logo w-32 h-full bg-center bg-contain bg-no-repeat svelte-18o8j06");
    			add_location(div, file, 77, 2, 2022);
    			attr_dev(path1, "fill", "currentColor");
    			attr_dev(path1, "fill-rule", "evenodd");
    			attr_dev(path1, "clip-rule", "evenodd");
    			attr_dev(path1, "d", "M3 8V6h18v2H3zm0 5h18v-2H3v2zm0 5h18v-2H3v2z");
    			add_location(path1, file, 81, 6, 2210);
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "fill", "none");
    			add_location(svg1, file, 80, 4, 2166);
    			attr_dev(button1, "class", "w-8 h-8 text-actionblue");
    			add_location(button1, file, 79, 2, 2092);
    			attr_dev(header, "class", "flex items-center justify-between bg-white p-3 fixed w-screen h-16 z-30");
    			add_location(header, file, 61, 0, 1354);

    			dispose = [
    				listen_dev(button0, "click", ctx.toggleLeftDrawer, false, false, false),
    				listen_dev(button1, "click", ctx.toggleRightDrawer, false, false, false)
    			];
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, path0);
    			append_dev(header, t0);
    			append_dev(header, div);
    			append_dev(header, t1);
    			append_dev(header, button1);
    			append_dev(button1, svg1);
    			append_dev(svg1, path1);
    			cssVars_action = cssVars.call(null, header, ctx.styleVars) || ({});
    			insert_dev(target, t2, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t3, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (is_function(cssVars_action.update) && changed.styleVars) cssVars_action.update.call(null, ctx.styleVars);

    			if (ctx.isLeftDrawerOpen) {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t3.parentNode, t3);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (ctx.isRightDrawerOpen) {
    				if (if_block1) {
    					if_block1.p(changed, ctx);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			if (cssVars_action && is_function(cssVars_action.destroy)) cssVars_action.destroy();
    			if (detaching) detach_dev(t2);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t3);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(if_block1_anchor);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { logo = "static/logo.png" } = $$props;
    	let isLeftDrawerOpen = false;
    	let isRightDrawerOpen = false;

    	function toggleLeftDrawer() {
    		$$invalidate("isLeftDrawerOpen", isLeftDrawerOpen = !isLeftDrawerOpen);
    	}

    	function toggleRightDrawer() {
    		$$invalidate("isRightDrawerOpen", isRightDrawerOpen = !isRightDrawerOpen);
    	}

    	let isUSA = true;

    	function toggleLocale() {
    		$$invalidate("isUSA", isUSA = !isUSA);
    	}

    	const writable_props = ["logo"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Src> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("logo" in $$props) $$invalidate("logo", logo = $$props.logo);
    	};

    	$$self.$capture_state = () => {
    		return {
    			logo,
    			isLeftDrawerOpen,
    			isRightDrawerOpen,
    			isUSA,
    			styleVars
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("logo" in $$props) $$invalidate("logo", logo = $$props.logo);
    		if ("isLeftDrawerOpen" in $$props) $$invalidate("isLeftDrawerOpen", isLeftDrawerOpen = $$props.isLeftDrawerOpen);
    		if ("isRightDrawerOpen" in $$props) $$invalidate("isRightDrawerOpen", isRightDrawerOpen = $$props.isRightDrawerOpen);
    		if ("isUSA" in $$props) $$invalidate("isUSA", isUSA = $$props.isUSA);
    		if ("styleVars" in $$props) $$invalidate("styleVars", styleVars = $$props.styleVars);
    	};

    	let styleVars;

    	$$self.$$.update = (changed = { logo: 1 }) => {
    		if (changed.logo) {
    			 $$invalidate("styleVars", styleVars = { logo: `url(${logo})` });
    		}
    	};

    	return {
    		logo,
    		isLeftDrawerOpen,
    		isRightDrawerOpen,
    		toggleLeftDrawer,
    		toggleRightDrawer,
    		isUSA,
    		toggleLocale,
    		styleVars
    	};
    }

    class Src extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { logo: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Src",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get logo() {
    		throw new Error("<Src>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set logo(value) {
    		throw new Error("<Src>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    return Src;

}());
