// Enclosure for a spigot station: the 2.8" display above the RC522 reader, the Pico W
// inside, standing tilted on the bar counter. Printing and assembly: ../README.md,
// "Enclosure".
//
// Everything is modelled in one frame, the box lying on its face the way the shell
// prints: x across, y up the station, z from the front face backwards. Seen from the
// front, +x is on the left. `part` picks what to render, and each part comes out lying
// the way it prints.

/* [Render] */
part = "assembly"; // [assembly, shell, lid, stand, fit_test]

/* [Display: 2.8" ILI9341 module, red board] */
// Board: across, and along from the pin header edge.
display_pcb = [50, 86];
// From the front of the glass to the back of the board.
display_stack = 6.4;
display_pcb_t = 1.6;
// Where the pin header ends up. Picture upside down: DISPLAY_MADCTL = 0x88 in config.py.
display_header = "bottom"; // [bottom, top]
// The picture, centred across the board.
display_view = [43.2, 57.6];
// From the pin header edge of the board to the picture.
display_view_offset = 19.4;
// From the pin header edge of the board to the glass.
display_glass_offset = 10.8;
display_glass_len = 69.2;
// Extra window around the picture, per side, so a small misfit still shows black glass.
window_margin = 1;

/* [Reader: RC522] */
// Board: across, and along from the antenna end.
reader_pcb = [40, 60];
reader_pcb_t = 1.6;
// Room in front of the board for its tallest part, the crystal.
reader_front_room = 4.5;
// Centre of the antenna coil, from the antenna end.
reader_coil_offset = 21.3;

/* [Pico W] */
pico_pcb = [51, 21];
pico_holes = [47, 11.4];
pico_hole_d = 2.1;
// Keeps the USB socket, on the side facing the lid, clear of the lid's rim.
pico_standoff = 5;
// Height of the Pico's centre line above the bottom of the box.
pico_y = 100;
// Where the USB cable comes out, seen from the front.
usb_side = "right"; // [left, right]

/* [Box] */
wall = 2;
front = 2;
lid_t = 2.5;
// Inside depth behind the front: Dupont plugs need about 38, soldered wires about 24.
inner_depth = 38;
corner_r = 4;
chamfer = 1;
// Clearance around each board, per side.
fit = 0.3;
// Room above the display and below the reader for the lid screws.
screw_strip = 8;
// Between the reader and the display.
board_gap = 4;
// Pilot hole for an M3 self-tapping screw, and the clearance hole in the lid.
screw_pilot = 2.6;
screw_clear = 3.4;
// Holes in the lid for a buzzer glued behind them.
buzzer_grille = true;
grille_y = 140;

/* [Stand] */
// Lean back from upright.
tilt = 15;
// How far the stand comes up the front of the box.
collar = 12;
stand_wall = 3;
stand_floor = 3;
// How far the foot reaches behind and in front of the box.
foot_back = 30;
foot_front = 10;
spine_w = 20;
spine_h = 70;
slot_fit = 0.4;

/* [Size buttons] */
// A 2-key membrane keypad stuck flat on a step of the stand, in front of the box. Its
// tail leaves on the right, seen from the front, and goes through the stand into the box.
keypad = true;
keypad_size = [40, 20];
keypad_t = 0.8;
keypad_tail_w = 10;
// How far in front of the box the keypad starts, and how high its step is.
keypad_gap = 7;
shelf_h = 16;

/* [Hidden] */
$fn = 48;
tab_t = 1.2;    // snap tab
tab_gap = 1;    // behind a snap tab, so it can flex
tab_len = 10;
hook = 0.6;     // how far a snap hook reaches over a board
rib_t = 1.2;
lip_h = 2;
lip_t = 1.6;
boss = 7;

in_w = display_pcb.x + 2 * fit + 2 * (tab_t + tab_gap);
in_h = 2 * screw_strip + display_pcb.y + reader_pcb.y + 4 * fit + board_gap;
W = in_w + 2 * wall;
H = in_h + 2 * wall;
D = front + inner_depth + lid_t;
back = front + inner_depth;  // where the shell ends and the lid begins

// Board pockets, from the bottom up.
reader_y = wall + screw_strip;
reader_len = reader_pcb.y + 2 * fit;
display_y = reader_y + reader_len + board_gap;
display_len = display_pcb.y + 2 * fit;

header_down = display_header == "bottom";
coil_y = reader_y + fit + reader_coil_offset;
view_y = display_y + fit + (header_down
    ? display_view_offset
    : display_pcb.y - display_view_offset - display_view.y);
window = [display_view.x + 2 * window_margin, display_view.y + 2 * window_margin];
glass_y = display_y + fit + (header_down
    ? display_glass_offset
    : display_pcb.y - display_glass_offset - display_glass_len);

screws = [for (sx = [-1, 1], sy = [0, 1])
    [sx * (in_w / 2 - boss / 2), sy ? H - wall - boss / 2 : wall + boss / 2]];
// The USB socket sits just inside a side wall, behind a hole for the plug.
usb_sx = usb_side == "right" ? -1 : 1;
pico_x = usb_sx * (in_w / 2 - 0.5 - 1.3 - pico_pcb.x / 2);
pico_z = back - pico_standoff - 1;  // the side with the pins

// The keypad, in the stand's frame: its pocket's centre in front of the box, and the slot
// beside it where the tail drops into the stand.
keypad_pocket = keypad_size + [0.8, 0.8];
keypad_y = keypad_gap + keypad_pocket.y / 2;
shelf_depth = keypad_gap + keypad_pocket.y + 5;
tail_drop = [4.5, keypad_tail_w + 1.5];
tail_drop_x = -(keypad_pocket.x + tail_drop.x) / 2;
// Where the tail comes up into the box, through its floor: clear of the lid screws'
// bosses, and behind the reader. Across, and behind the front face.
tail_entry_x = -13.5;
tail_entry_z = 10;
tail_entry = [keypad_tail_w + 2, 5];

if (part == "assembly") assembly();
else if (part == "shell") shell();
else if (part == "lid") translate([0, 0, D]) rotate([180, 0, 0]) lid();
else if (part == "stand") stand();
else if (part == "fit_test") fit_test();

// --- parts -----------------------------------------------------------------------------

module shell() {
    difference() {
        union() {
            difference() {
                hull() {
                    linear_extrude(0.01) offset(-chamfer) outline();
                    translate([0, 0, chamfer]) linear_extrude(back - chamfer) outline();
                }
                translate([0, 0, front]) linear_extrude(back) cavity();
            }
            for (p = screws)
                translate([p.x - boss / 2, p.y - boss / 2, front - 0.01])
                    cube([boss, boss, back - front + 0.01]);
            display_seat();
            reader_seat();
        }
        display_window();
        // Mirrored, as it is drawn from behind.
        translate([0, coil_y, -0.01]) linear_extrude(0.61) mirror([1, 0]) tap_mark();
        // The Pico's USB plug.
        translate([usb_sx * (in_w / 2 + wall / 2), pico_y, back - 4]) cube([wall + 4, 12, 10], center = true);
        // The keypad's tail, coming up out of the stand.
        if (keypad)
            translate([tail_entry_x - tail_entry.x / 2, -1, tail_entry_z])
                cube([tail_entry.x, wall + 1.01, tail_entry.y]);
        for (p = screws) translate([p.x, p.y, back - 15]) cylinder(d = screw_pilot, h = 16);
    }
}

// The front of the shell only, to check the window and how the boards snap in before
// printing the whole box.
module fit_test()
    intersection() {
        shell();
        translate([-W, -1, -1]) cube([2 * W, H + 2, front + display_stack + 4]);
    }

module lid() {
    difference() {
        union() {
            hull() {
                translate([0, 0, back]) linear_extrude(lid_t - chamfer) outline();
                translate([0, 0, D - 0.01]) linear_extrude(0.01) offset(-chamfer) outline();
            }
            // Keys into the shell.
            translate([0, 0, back - lip_h]) linear_extrude(lip_h + 0.01)
                difference() {
                    cavity(0.2);
                    cavity(0.2 + lip_t);
                }
            // The Pico hangs upside down on these, its pins facing forward.
            for (sx = [-1, 1], sy = [-1, 1])
                translate([pico_x + sx * pico_holes.x / 2, pico_y + sy * pico_holes.y / 2, 0]) {
                    translate([0, 0, back - pico_standoff])
                        cylinder(d = 5, h = pico_standoff + 0.01);
                    translate([0, 0, back - pico_standoff - 2.4])
                        cylinder(d = pico_hole_d - 0.25, h = 2.41);
                }
        }
        for (p = screws) {
            translate([p.x, p.y, back - lip_h - 1]) cylinder(d = screw_clear, h = D);
            translate([p.x - boss / 2 - 0.3, p.y - boss / 2 - 0.3, back - lip_h - 1])
                cube([boss + 0.6, boss + 0.6, lip_h + 1]);
        }
        if (buzzer_grille)
            for (p = [[0, 0], each [for (a = [0:60:300]) 4.5 * [cos(a), sin(a)]]])
                translate([p.x, grille_y + p.y, back - 1]) cylinder(d = 2, h = lid_t + 2);
    }
}

module stand() {
    foot_y = -(D * cos(tilt) + foot_back);
    intersection() {
        difference() {
            union() {
                hull() {
                    translate([-W / 2 - stand_wall, foot_y, 0])
                        cube([W + 2 * stand_wall, foot_front - foot_y, stand_floor]);
                    on_stand() intersection() {
                        translate([0, 0, -stand_wall])
                            linear_extrude(D + 2 * stand_wall) outline(stand_wall);
                        translate([-W, -50, -50]) cube([2 * W, 50 + collar, D + 100]);
                    }
                }
                // Holds the box up from behind.
                hull() {
                    translate([-spine_w / 2, foot_y, 0]) cube([spine_w, 10, stand_floor]);
                    on_stand() translate([-spine_w / 2, 0, D]) cube([spine_w, spine_h, stand_wall]);
                }
                if (keypad) keypad_shelf();
            }
            on_stand() {
                translate([0, 0, -slot_fit]) linear_extrude(D + 2 * slot_fit) outline(slot_fit);
                // Heads of the lower lid screws.
                for (p = screws) if (p.y < H / 2) translate([p.x, p.y, D - 0.01]) cylinder(d = 8, h = 4);
            }
            if (keypad) keypad_cuts();
        }
        translate([-W, -200, 0]) cube([2 * W, 400, 200]);
    }
}

module assembly() {
    on_stand() {
        color("#2b2f36") shell();
        color("#454b55") lid();
        boards();
    }
    color("#d7dbe0") stand();
    // The keypad: red on the left, seen from the front, which is +x.
    if (keypad) translate([0, keypad_y, shelf_h - keypad_t]) {
        color("#3a3f47") linear_extrude(keypad_t) square(keypad_size, center = true);
        for (button = [[10, "#dc2626"], [-10, "#facc15"]])
            color(button[1]) translate([button[0], 0, keypad_t]) cylinder(d = 13, h = 0.6);
    }
}

// --- pieces ----------------------------------------------------------------------------

// Puts the box, modelled upright, into the stand: leaning back by `tilt`, its bottom on
// the stand's floor.
module on_stand()
    translate([0, 0, D * sin(tilt) + stand_floor]) rotate([90 + tilt, 0, 0]) children();

// The step in front of the box that the keypad lies on, its front edge chamfered.
module keypad_shelf() {
    width = W + 2 * stand_wall;
    translate([-width / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(width)
        polygon([
            [0, 0], [shelf_depth, 0], [shelf_depth, shelf_h - 2], [shelf_depth - 2, shelf_h], [0, shelf_h],
        ]);
}

// The keypad's pocket, and the way its tail takes into the box: down through a slot
// beside the keypad, back under the stand in a channel open to the counter, and up
// through the stand's floor and the box's.
module keypad_cuts() {
    translate([0, keypad_y, shelf_h - keypad_t]) linear_extrude(keypad_t + 1) square(keypad_pocket, center = true);
    translate([tail_drop_x, keypad_y, -1]) linear_extrude(shelf_h + 2) square(tail_drop, center = true);

    // Pointed roofs, which print without bridging. Under the step the channel is tall and
    // wide, for the tail to make its quarter turn from lying across to lying along, and it
    // stops 2 mm under the keypad. Under the box, where the floor slopes down towards the
    // back, the tail lies flat and the channel is low.
    x0 = tail_drop_x - tail_drop.x / 2 - 1;
    x1 = tail_entry_x + tail_entry.x / 2 + 1;
    roof = (x1 - x0) / 2;
    walls = shelf_h - keypad_t - 2 - roof;
    front_end = keypad_y + tail_drop.y / 2 + 1;
    translate([0, front_end, 0]) rotate([90, 0, 0]) linear_extrude(front_end - 2)
        polygon([[x0, -1], [x1, -1], [x1, walls], [(x0 + x1) / 2, walls + roof], [x0, walls]]);

    low = [tail_entry_x - tail_entry.x / 2 - 1, tail_entry_x + tail_entry.x / 2 + 1];
    back_end = -(tail_entry_z + tail_entry.y) * cos(tilt) - 2;
    translate([0, 5, 0]) rotate([90, 0, 0]) linear_extrude(5 - back_end)
        polygon([[low[0], -1], [low[1], -1], [(low[0] + low[1]) / 2, (low[1] - low[0]) / 2]]);

    // Straight up from the channel, under the whole of the hole in the box's floor — which
    // leans with the box, so it lies between these two depths in the stand.
    entry_front = -tail_entry_z * cos(tilt);
    entry_back = -(tail_entry_z + tail_entry.y) * cos(tilt) - wall * sin(tilt);
    translate([tail_entry_x - tail_entry.x / 2, entry_back - 0.5, -1])
        cube([tail_entry.x, entry_front - entry_back + 1, shelf_h + 10]);
}

module outline(grow = 0)
    translate([0, H / 2]) rounded([W + 2 * grow, H + 2 * grow], corner_r + grow);

module cavity(shrink = 0)
    translate([0, H / 2]) rounded([in_w - 2 * shrink, in_h - 2 * shrink], corner_r - wall);

module rounded(size, r) offset(r) offset(-r) square(size, center = true);

module both_sides() {
    children();
    mirror([1, 0, 0]) children();
}

// The display rests its glass on the front wall; tabs on its long sides snap over the
// back of the board.
module display_seat() {
    catch = front + display_stack;
    both_sides() for (f = [0.22, 0.78])
        translate([display_pcb.x / 2 + fit, display_y + display_len * f, 0]) snap(catch);
    for (y = [display_y - rib_t, display_y + display_len])
        translate([-15, y, front - 0.01]) cube([30, rib_t, display_stack + 0.01]);
}

// The reader stands off the front wall on two ledges, clear of its crystal, and snaps in
// like the display.
module reader_seat() {
    catch = front + reader_front_room + reader_pcb_t;
    both_sides() {
        for (f = [0.25, 0.75])
            translate([reader_pcb.x / 2 + fit, reader_y + reader_len * f, 0]) snap(catch);
        translate([reader_pcb.x / 2 - 1.5, reader_y + 15, front - 0.01])
            cube([1.5 + fit, 30, reader_front_room + 0.01]);
    }
    for (y = [reader_y - rib_t, reader_y + reader_len])
        translate([-12, y, front - 0.01]) cube([24, rib_t, catch - front + 0.01]);
}

// A tab standing on the front wall just outside a board's edge (at x = 0, the board
// towards -x), its hook catching the back of the board at `catch`.
module snap(catch)
    rotate([90, 0, 0]) linear_extrude(tab_len, center = true)
        polygon([
            [0, front - 0.01], [tab_t, front - 0.01], [tab_t, catch + 2], [0, catch + 2],
            [-hook, catch + 0.4], [-hook, catch], [0, catch],
        ]);

module display_window()
    translate([0, view_y + display_view.y / 2])
        hull() {
            translate([0, 0, front - 0.01]) linear_extrude(0.03) rounded(window, 1);
            translate([0, 0, -0.01]) linear_extrude(0.01)
                rounded([window.x + 2 * front, window.y + 2 * front], 1 + front);
        }

// "Tap here", sunk into the front over the reader's antenna.
module tap_mark() {
    difference() {
        circle(19.6);
        circle(18.4);
    }
    translate([-9, 0]) for (r = [3.5, 7.5, 11.5, 15.5]) arc(r, 1.8, 45);
}

module arc(r, w, a) {
    intersection() {
        difference() {
            circle(r + w / 2);
            circle(r - w / 2);
        }
        polygon([[0, 0], [r + w, -(r + w) * tan(a)], [r + w, (r + w) * tan(a)]]);
    }
    for (s = [-1, 1]) rotate(s * a) translate([r, 0]) circle(w / 2);
}

// Stand-ins for the boards, to see how they sit.
module boards() {
    color("#c62828") translate([-display_pcb.x / 2, display_y + fit, front + display_stack - display_pcb_t])
        cube([display_pcb.x, display_pcb.y, display_pcb_t]);
    color("#15171a") translate([-display_pcb.x / 2, glass_y, front + 0.1])
        cube([display_pcb.x, display_glass_len, display_stack - display_pcb_t - 0.1]);
    color("#3d7bd9") translate([-display_view.x / 2, view_y, front])
        cube([display_view.x, display_view.y, 0.1]);
    color("#1f4fa8") translate([-reader_pcb.x / 2, reader_y + fit, front + reader_front_room])
        cube([reader_pcb.x, reader_pcb.y, reader_pcb_t]);
    color("#2e7d32") translate([pico_x - pico_pcb.x / 2, pico_y - pico_pcb.y / 2, pico_z])
        cube([pico_pcb.x, pico_pcb.y, 1]);
}
